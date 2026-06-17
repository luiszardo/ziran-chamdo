-- ================================================================
-- ZIRAN DESK — Seed v3  |  Execute APÓS o schema.sql
-- ================================================================

insert into status_config (id_status, nome_status, label_status, ordem, cor, encerrado, ativo) values
  ('STS-ABERTO',      'aberto',             'Aberto',             1, '#ef4444', false, true),
  ('STS-ANALISE',     'em_analise',         'Em análise',         2, '#f59e0b', false, true),
  ('STS-ATENDIMENTO', 'em_atendimento',     'Em atendimento',     3, '#3b82f6', false, true),
  ('STS-AGUARDANDO',  'aguardando_usuario', 'Aguardando usuário', 4, '#8b5cf6', false, true),
  ('STS-RESOLVIDO',   'resolvido',          'Resolvido',          5, '#10b981', true,  true),
  ('STS-FECHADO',     'fechado',            'Fechado',            6, '#64748b', true,  true)
on conflict (nome_status) do nothing;

insert into sla_config (id_sla, prioridade, tempo_primeira_resposta_horas, tempo_resolucao_horas) values
  ('SLA-CRITICA', 'critica', 1,  4),
  ('SLA-ALTA',    'alta',    2,  8),
  ('SLA-MEDIA',   'media',   4, 24),
  ('SLA-BAIXA',   'baixa',   8, 72)
on conflict (prioridade) do nothing;

insert into categorias (id_categoria, nome_categoria, icone, ordem, ativo) values
  ('CAT-HW',   'Hardware',             '💻', 1, true),
  ('CAT-SW',   'Software',             '⚙️', 2, true),
  ('CAT-NET',  'Rede e Conectividade', '🌐', 3, true),
  ('CAT-ACC',  'Acesso e Permissões',  '🔑', 4, true),
  ('CAT-MAIL', 'E-mail',               '📧', 5, true),
  ('CAT-IMP',  'Impressoras',          '🖨️', 6, true),
  ('CAT-OTH',  'Outros',               '📋', 7, true)
on conflict do nothing;

insert into subcategorias (id_subcategoria, id_categoria, nome_subcategoria, ordem, ativo) values
  ('SUB-HW-01','CAT-HW',  'Notebook / Desktop',     1, true),
  ('SUB-HW-02','CAT-HW',  'Monitor',                2, true),
  ('SUB-HW-03','CAT-HW',  'Teclado / Mouse',        3, true),
  ('SUB-HW-04','CAT-HW',  'Celular Corporativo',    4, true),
  ('SUB-SW-01','CAT-SW',  'Sistema Operacional',    1, true),
  ('SUB-SW-02','CAT-SW',  'Aplicativo Corporativo', 2, true),
  ('SUB-SW-03','CAT-SW',  'ERP / CRM',              3, true),
  ('SUB-SW-04','CAT-SW',  'Office / Produtividade', 4, true),
  ('SUB-NET-01','CAT-NET','Wi-Fi',                  1, true),
  ('SUB-NET-02','CAT-NET','VPN',                    2, true),
  ('SUB-NET-03','CAT-NET','Internet Lenta',         3, true),
  ('SUB-ACC-01','CAT-ACC','Redefinição de Senha',   1, true),
  ('SUB-ACC-02','CAT-ACC','Conta Bloqueada',        2, true),
  ('SUB-ACC-03','CAT-ACC','Novo Acesso',            3, true),
  ('SUB-MAIL-01','CAT-MAIL','Criar Conta',          1, true),
  ('SUB-MAIL-02','CAT-MAIL','Problema ao Enviar',   2, true),
  ('SUB-IMP-01','CAT-IMP','Impressora Offline',     1, true),
  ('SUB-IMP-02','CAT-IMP','Fila Travada',           2, true),
  ('SUB-OTH-01','CAT-OTH','Solicitação Geral',      1, true),
  ('SUB-OTH-02','CAT-OTH','Informação',             2, true)
on conflict do nothing;
