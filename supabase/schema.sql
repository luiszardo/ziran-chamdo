-- ================================================================
-- ZIRAN DESK — Schema v3 Premium
-- Execute no Supabase SQL Editor
-- Seguro para re-executar (idempotente)
-- ================================================================

-- Extensões
create extension if not exists "pgcrypto";

-- ── usuarios ─────────────────────────────────────────────────────
create table if not exists usuarios (
  id_usuario    text        primary key,
  nome          text        not null,
  email         text        not null unique,
  senha_hash    text        not null,
  setor         text        not null default '',
  perfil        text        not null check (perfil in ('admin','tecnico','gestor','solicitante')),
  status        text        not null default 'ativo' check (status in ('ativo','inativo')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_login  timestamptz
);

-- ── cadastros_pendentes ──────────────────────────────────────────
create table if not exists cadastros_pendentes (
  id_cadastro  text        primary key,
  nome         text        not null,
  email        text        not null,
  senha_hash   text        not null,
  setor        text        not null default '',
  status       text        not null default 'pendente' check (status in ('pendente','aprovado','rejeitado')),
  criado_em    timestamptz not null default now(),
  avaliado_em  timestamptz,
  avaliado_por text
);

-- ── categorias ───────────────────────────────────────────────────
create table if not exists categorias (
  id_categoria   text        primary key,
  nome_categoria text        not null,
  icone          text        not null default '📁',
  ordem          integer     not null default 0,
  ativo          boolean     not null default true
);

-- ── subcategorias ────────────────────────────────────────────────
create table if not exists subcategorias (
  id_subcategoria   text    primary key,
  id_categoria      text    not null references categorias(id_categoria) on delete cascade,
  nome_subcategoria text    not null,
  ordem             integer not null default 0,
  ativo             boolean not null default true
);

-- ── status_config ────────────────────────────────────────────────
create table if not exists status_config (
  id_status    text    primary key,
  nome_status  text    not null unique,
  label_status text    not null,
  ordem        integer not null default 0,
  cor          text    not null default '#94a3b8',
  encerrado    boolean not null default false,
  ativo        boolean not null default true
);

-- ── sla_config ───────────────────────────────────────────────────
create table if not exists sla_config (
  id_sla                        text    primary key,
  prioridade                    text    not null unique check (prioridade in ('critica','alta','media','baixa')),
  tempo_primeira_resposta_horas integer not null default 4,
  tempo_resolucao_horas         integer not null default 24,
  ativo                         boolean not null default true
);

-- ── chamados ─────────────────────────────────────────────────────
create table if not exists chamados (
  id_chamado               text        primary key,
  protocolo                text        not null unique,
  titulo                   text        not null,
  descricao                text        not null default '',
  categoria_id             text        references categorias(id_categoria),
  subcategoria_id          text        references subcategorias(id_subcategoria),
  prioridade               text        not null default 'media' check (prioridade in ('critica','alta','media','baixa')),
  status                   text        not null default 'aberto',
  solicitante_id           text        not null references usuarios(id_usuario),
  tecnico_id               text        references usuarios(id_usuario),
  setor_solicitante        text        not null default '',
  canal_origem             text        not null default 'portal',
  data_abertura            timestamptz not null default now(),
  data_atualizacao         timestamptz not null default now(),
  data_fechamento          timestamptz,
  sla_resolucao_limite     timestamptz,
  sla_resolucao_em         timestamptz,
  tempo_total_horas        numeric(10,2),
  ativo                    boolean     not null default true
);

create index if not exists idx_chamados_status      on chamados(status);
create index if not exists idx_chamados_prioridade  on chamados(prioridade);
create index if not exists idx_chamados_solicitante on chamados(solicitante_id);
create index if not exists idx_chamados_tecnico     on chamados(tecnico_id);
create index if not exists idx_chamados_setor       on chamados(setor_solicitante);
create index if not exists idx_chamados_abertura    on chamados(data_abertura desc);

-- ── interacoes ───────────────────────────────────────────────────
create table if not exists interacoes (
  id_interacao   text        primary key,
  id_chamado     text        not null references chamados(id_chamado) on delete cascade,
  autor_id       text,
  tipo_autor     text        not null default 'sistema' check (tipo_autor in ('sistema','tecnico','solicitante','admin','gestor')),
  tipo_interacao text        not null default 'mensagem' check (tipo_interacao in ('mensagem','status','atribuicao','sistema')),
  mensagem       text        not null,
  visibilidade   text        not null default 'publico' check (visibilidade in ('publico','interno')),
  status_origem  text,
  status_destino text,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_interacoes_chamado on interacoes(id_chamado);
create index if not exists idx_interacoes_data    on interacoes(criado_em asc);

-- ── anexos ───────────────────────────────────────────────────────
create table if not exists anexos (
  id_anexo     text        primary key,
  id_chamado   text        not null references chamados(id_chamado) on delete cascade,
  nome_arquivo text        not null,
  url_arquivo  text        not null,
  tipo_arquivo text        not null default 'application/octet-stream',
  tamanho_kb   integer     not null default 0,
  enviado_por  text,
  criado_em    timestamptz not null default now(),
  ativo        boolean     not null default true
);

create index if not exists idx_anexos_chamado on anexos(id_chamado);

-- ── log_auditoria ────────────────────────────────────────────────
create table if not exists log_auditoria (
  id_log        text        primary key,
  modulo        text        not null,
  acao          text        not null,
  referencia_id text,
  descricao     text,
  usuario_id    text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_log_criado on log_auditoria(criado_em desc);

-- ── RLS desabilitado (acesso via service_role) ───────────────────
alter table usuarios           disable row level security;
alter table cadastros_pendentes disable row level security;
alter table categorias         disable row level security;
alter table subcategorias      disable row level security;
alter table status_config      disable row level security;
alter table sla_config         disable row level security;
alter table chamados           disable row level security;
alter table interacoes         disable row level security;
alter table anexos             disable row level security;
alter table log_auditoria      disable row level security;

-- ── Triggers ─────────────────────────────────────────────────────
create or replace function fn_update_chamado_ts()
returns trigger language plpgsql as $$
begin new.data_atualizacao = now(); return new; end; $$;

create or replace function fn_update_usuario_ts()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists trg_chamados_updated on chamados;
drop trigger if exists trg_usuarios_updated on usuarios;

create trigger trg_chamados_updated
  before update on chamados for each row execute procedure fn_update_chamado_ts();

create trigger trg_usuarios_updated
  before update on usuarios for each row execute procedure fn_update_usuario_ts();
