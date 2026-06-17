/**
 * ZIRAN DESK v3 Premium — Cloudflare Pages Function
 * File: functions/api/[[path]].js
 *
 * ENV VARS (Cloudflare Pages → Settings → Variables and Secrets):
 *   SUPABASE_URL         https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY eyJ... (service_role)
 *   JWT_SECRET           string aleatória ≥ 32 chars
 *   BOOTSTRAP_SECRET     senha única para criar o admin inicial
 */

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: CORS });
  try {
    return await router(request, env);
  } catch (e) {
    console.error('[ZD]', e.message);
    return R({ ok: false, error: e.message || 'Erro interno.' }, 500);
  }
}

// ── ROUTER ────────────────────────────────────────────────────────
async function router(req, env) {
  const db = new DB(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  let p = {};

  if (req.method === 'GET') {
    new URL(req.url).searchParams.forEach((v, k) => { p[k] = v; });
  } else {
    try { p = await req.json(); } catch { p = {}; }
  }

  const action = (p.action || '').trim();
  if (!action) return R({ ok: false, error: '"action" obrigatório.' }, 400);

  // ── Rotas públicas ────────────────────────────────────────────
  if (action === 'health')           return R({ ok: true, ts: new Date().toISOString() });
  if (action === 'auth.login')       return authLogin(p, db, env);
  if (action === 'auth.bootstrap')   return authBootstrap(p, db, env);
  if (action === 'auth.register')    return authRegister(p, db, env);

  // ── Autenticação ──────────────────────────────────────────────
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const token  = bearer || p.token || '';
  const sess   = await verifyJWT(token, env.JWT_SECRET);
  if (!sess) return R({ ok: false, error: 'Sessão expirada. Faça login novamente.' }, 401);

  // ── Rotas protegidas ──────────────────────────────────────────
  switch (action) {
    case 'meta.catalogs':             return metaCatalogs(db);
    case 'dashboard.summary':         return dashboardSummary(sess, db);
    case 'ticket.list':               return ticketList(p, sess, db);
    case 'ticket.detail':             return ticketDetail(p, sess, db);
    case 'ticket.create':             return ticketCreate(p, sess, db, env);
    case 'ticket.updateStatus':       return ticketUpdateStatus(p, sess, db);
    case 'ticket.addMessage':         return ticketAddMessage(p, sess, db, env);
    case 'ticket.assign':             return ticketAssign(p, sess, db);
    case 'admin.users':               return adminUsers(p, sess, db);
    case 'admin.user.save':           return adminUserSave(p, sess, db, env);
    case 'admin.category.save':       return adminCategorySave(p, sess, db);
    case 'admin.registrations':       return adminRegistrations(p, sess, db);
    case 'admin.registration.action': return adminRegistrationAction(p, sess, db, env);
    default: return R({ ok: false, error: `Ação desconhecida: ${action}` }, 404);
  }
}

// ── PERFIS E PERMISSÕES ────────────────────────────────────────────
// admin    = tudo
// tecnico  = chamados (atualizar, fechar, atribuir)
// gestor   = visualizar tudo + abrir chamados (sem alterar)
// solicitante = apenas próprios chamados
const STAFF   = ['admin', 'tecnico', 'gestor'];
const EDITORS = ['admin', 'tecnico'];

function perm(sess, allowed) {
  if (!allowed.includes(sess.perfil)) throw new Error('Permissão insuficiente.');
}

// ================================================================
// AUTH
// ================================================================
async function authLogin(p, db, env) {
  const email = String(p.email || '').trim().toLowerCase();
  const senha = String(p.senha || '');
  if (!email || !senha) return R({ ok: false, error: 'E-mail e senha obrigatórios.' }, 400);

  const [u] = await db.q('usuarios', { email: `eq.${email}`, status: 'eq.ativo', limit: 1 });
  if (!u) return R({ ok: false, error: 'Credenciais inválidas.' }, 401);
  if (u.senha_hash !== await sha256(senha + env.JWT_SECRET))
    return R({ ok: false, error: 'Credenciais inválidas.' }, 401);

  await db.patch('usuarios', { id_usuario: u.id_usuario }, { ultimo_login: now() });
  log(db, 'auth', 'login', u.id_usuario, u.email, u.id_usuario);

  const token = await signJWT(
    { id: u.id_usuario, email: u.email, perfil: u.perfil, nome: u.nome, setor: u.setor || '' },
    env.JWT_SECRET
  );
  return R({ ok: true, token, user: { id: u.id_usuario, nome: u.nome, email: u.email, perfil: u.perfil, setor: u.setor || '' } });
}

async function authBootstrap(p, db, env) {
  if (!env.BOOTSTRAP_SECRET || p.secret !== env.BOOTSTRAP_SECRET)
    return R({ ok: false, error: 'Secret inválido.' }, 403);
  const [e] = await db.q('usuarios', { perfil: 'eq.admin', limit: 1 });
  if (e) return R({ ok: false, error: 'Admin já existe.' }, 409);
  const id = uid('USR');
  await db.ins('usuarios', {
    id_usuario: id, nome: 'Administrador', email: 'admin@empresa.com',
    senha_hash: await sha256('Admin@2024' + env.JWT_SECRET),
    setor: 'TI', perfil: 'admin', status: 'ativo', criado_em: now(), atualizado_em: now(),
  });
  return R({ ok: true, message: 'Admin criado.', email: 'admin@empresa.com', senha: 'Admin@2024' });
}

async function authRegister(p, db, env) {
  const nome  = String(p.nome  || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  const setor = String(p.setor || '').trim();
  const senha = String(p.senha || '');

  if (!nome || !email || !setor || !senha)
    return R({ ok: false, error: 'Todos os campos são obrigatórios.' }, 400);
  if (senha.length < 6)
    return R({ ok: false, error: 'Senha deve ter pelo menos 6 caracteres.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return R({ ok: false, error: 'E-mail inválido.' }, 400);

  const [u1] = await db.q('usuarios',            { email: `eq.${email}`, limit: 1 });
  const [u2] = await db.q('cadastros_pendentes', { email: `eq.${email}`, status: 'eq.pendente', limit: 1 });
  if (u1) return R({ ok: false, error: 'Este e-mail já possui acesso.' }, 409);
  if (u2) return R({ ok: false, error: 'Já existe uma solicitação pendente para este e-mail.' }, 409);

  await db.ins('cadastros_pendentes', {
    id_cadastro: uid('CAD'), nome, email,
    senha_hash: await sha256(senha + env.JWT_SECRET),
    setor, status: 'pendente', criado_em: now(),
  });
  return R({ ok: true, message: 'Solicitação enviada com sucesso! Aguarde aprovação do administrador.' });
}

// ================================================================
// META
// ================================================================
async function metaCatalogs(db) {
  const [cats, subs, sts, sla] = await Promise.all([
    db.q('categorias',    { ativo: 'eq.true', order: 'ordem.asc' }),
    db.q('subcategorias', { ativo: 'eq.true', order: 'ordem.asc' }),
    db.q('status_config', { ativo: 'eq.true', order: 'ordem.asc' }),
    db.q('sla_config',    { ativo: 'eq.true'                     }),
  ]);
  return R({ ok: true, categorias: cats, subcategorias: subs, status: sts, sla });
}

// ================================================================
// DASHBOARD
// ================================================================
async function dashboardSummary(sess, db) {
  perm(sess, STAFF);

  const [chamados, cats, users] = await Promise.all([
    db.q('chamados', { ativo: 'eq.true' }),
    db.q('categorias', { ativo: 'eq.true' }),
    db.q('usuarios',   { status: 'eq.ativo' }),
  ]);

  const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const abertos       = chamados.filter(c => c.status === 'aberto').length;
  const emAtendimento = chamados.filter(c => c.status === 'em_atendimento').length;
  const resolvidosMes = chamados.filter(c =>
    ['resolvido','fechado'].includes(c.status) && c.data_fechamento >= mesInicio
  ).length;
  const aguardando    = chamados.filter(c => c.status === 'aguardando_usuario').length;

  const finalizados = chamados.filter(c => c.tempo_total_horas > 0);
  const tempoMedio  = finalizados.length
    ? (finalizados.reduce((s, c) => s + parseFloat(c.tempo_total_horas || 0), 0) / finalizados.length).toFixed(1)
    : 0;

  // Por categoria
  const catMap = {};
  chamados.forEach(c => {
    const nome = cats.find(x => x.id_categoria === c.categoria_id)?.nome_categoria || 'Sem categoria';
    catMap[nome] = (catMap[nome] || 0) + 1;
  });

  // Por prioridade
  const priMap = { critica: 0, alta: 0, media: 0, baixa: 0 };
  chamados.forEach(c => { if (c.prioridade in priMap) priMap[c.prioridade]++; });

  // Por técnico
  const tecMap = {};
  chamados.filter(c => c.tecnico_id).forEach(c => {
    const nome = users.find(u => u.id_usuario === c.tecnico_id)?.nome || 'N/A';
    tecMap[nome] = (tecMap[nome] || 0) + 1;
  });

  // Por setor (análise de setor com mais problemas)
  const setorMap = {};
  chamados.forEach(c => {
    const setor = c.setor_solicitante || 'Não informado';
    if (!setorMap[setor]) setorMap[setor] = { total: 0, abertos: 0, criticos: 0 };
    setorMap[setor].total++;
    if (['aberto','em_analise','em_atendimento'].includes(c.status)) setorMap[setor].abertos++;
    if (c.prioridade === 'critica') setorMap[setor].criticos++;
  });

  // Por status
  const statusMap = {};
  chamados.forEach(c => { statusMap[c.status] = (statusMap[c.status] || 0) + 1; });

  // Tendência mensal (últimos 6 meses)
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
    const ini = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
    meses.push({
      mes: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      total: chamados.filter(c => c.data_abertura >= ini && c.data_abertura <= fim).length,
    });
  }

  return R({
    ok: true,
    summary: { abertos, emAtendimento, resolvidosMes, aguardando, tempoMedio, total: chamados.length },
    charts: {
      categorias:  Object.entries(catMap).map(([nome, total]) => ({ nome, total })).sort((a,b) => b.total-a.total).slice(0,8),
      prioridades: Object.entries(priMap).map(([nome, total]) => ({ nome, total })),
      tecnicos:    Object.entries(tecMap).map(([nome, total]) => ({ nome, total })).sort((a,b) => b.total-a.total).slice(0,8),
      setores:     Object.entries(setorMap).map(([setor, d]) => ({ setor, ...d })).sort((a,b) => b.total-a.total).slice(0,10),
      status:      Object.entries(statusMap).map(([nome, total]) => ({ nome, total })),
      tendencia:   meses,
    },
  });
}

// ================================================================
// TICKETS
// ================================================================
async function ticketList(p, sess, db) {
  const f = { ativo: 'eq.true', order: 'data_abertura.desc', limit: parseInt(p.limit || 300) };

  if (sess.perfil === 'solicitante') {
    f.solicitante_id = `eq.${sess.id}`;
  } else {
    // staff + gestor vê tudo
    if (p.status)     f.status     = `eq.${p.status}`;
    if (p.prioridade) f.prioridade = `eq.${p.prioridade}`;
    if (p.setor)      f.setor_solicitante = `eq.${p.setor}`;
    if (p.tecnico_id) f.tecnico_id = `eq.${p.tecnico_id}`;
  }

  let rows = await db.q('chamados', f);

  if (p.busca?.trim()) {
    const q = p.busca.trim().toLowerCase();
    rows = rows.filter(c =>
      c.titulo.toLowerCase().includes(q) ||
      c.protocolo.toLowerCase().includes(q)
    );
  }

  if (!rows.length) return R({ ok: true, items: [], total: 0 });

  const allIds = [...new Set([...rows.map(c=>c.solicitante_id), ...rows.map(c=>c.tecnico_id).filter(Boolean)])];
  const catIds = [...new Set(rows.map(c=>c.categoria_id).filter(Boolean))];

  const [users, cats] = await Promise.all([
    allIds.length ? db.q('usuarios',   { id_usuario:   `in.(${allIds.join(',')})` }) : Promise.resolve([]),
    catIds.length ? db.q('categorias', { id_categoria: `in.(${catIds.join(',')})` }) : Promise.resolve([]),
  ]);

  const enrich = c => ({
    ...c,
    solicitante:   { id: c.solicitante_id, nome: users.find(u=>u.id_usuario===c.solicitante_id)?.nome || '—' },
    tecnico:       c.tecnico_id ? { id: c.tecnico_id, nome: users.find(u=>u.id_usuario===c.tecnico_id)?.nome || '—' } : null,
    categoria:     { id: c.categoria_id,  nome: cats.find(x=>x.id_categoria===c.categoria_id)?.nome_categoria || '—' },
  });

  return R({ ok: true, items: rows.map(enrich), total: rows.length });
}

async function ticketDetail(p, sess, db) {
  if (!p.id_chamado) return R({ ok: false, error: 'id_chamado obrigatório.' }, 400);

  const [t] = await db.q('chamados', { id_chamado: `eq.${p.id_chamado}`, ativo: 'eq.true', limit: 1 });
  if (!t) return R({ ok: false, error: 'Chamado não encontrado.' }, 404);

  // Solicitante só vê próprio chamado
  if (sess.perfil === 'solicitante' && t.solicitante_id !== sess.id)
    return R({ ok: false, error: 'Acesso negado.' }, 403);

  const [users, cats, subs, ints, anexos] = await Promise.all([
    db.q('usuarios',      {}),
    db.q('categorias',    {}),
    db.q('subcategorias', {}),
    db.q('interacoes',    { id_chamado: `eq.${p.id_chamado}`, order: 'criado_em.asc' }),
    db.q('anexos',        { id_chamado: `eq.${p.id_chamado}`, ativo: 'eq.true'       }),
  ]);

  const g = id => users.find(u => u.id_usuario === id);

  // Gestor e solicitante não veem notas internas
  const interacoes = ints
    .filter(i => !['solicitante','gestor'].includes(sess.perfil) || i.visibilidade !== 'interno')
    .map(i => ({
      ...i,
      autor_nome: i.tipo_autor === 'sistema' ? 'Sistema' : (g(i.autor_id)?.nome || 'Sistema'),
    }));

  return R({
    ok: true,
    ticket: {
      ...t,
      solicitante:  { id: t.solicitante_id, nome: g(t.solicitante_id)?.nome || '—', setor: g(t.solicitante_id)?.setor || '—' },
      tecnico:      t.tecnico_id ? { id: t.tecnico_id, nome: g(t.tecnico_id)?.nome || '—' } : null,
      categoria:    { id: t.categoria_id,    nome: cats.find(x=>x.id_categoria===t.categoria_id)?.nome_categoria   || '—' },
      subcategoria: { id: t.subcategoria_id, nome: subs.find(x=>x.id_subcategoria===t.subcategoria_id)?.nome_subcategoria || '—' },
    },
    interacoes,
    anexos,
  });
}

async function ticketCreate(p, sess, db, env) {
  const titulo    = String(p.titulo    || '').trim();
  const descricao = String(p.descricao || '').trim();
  if (!titulo || !descricao || !p.categoria_id)
    return R({ ok: false, error: 'Título, descrição e categoria são obrigatórios.' }, 400);

  const [slaRow] = await db.q('sla_config', { prioridade: `eq.${p.prioridade || 'media'}`, ativo: 'eq.true', limit: 1 });
  const slaH     = parseInt(slaRow?.tempo_resolucao_horas || 24);
  const [user]   = await db.q('usuarios', { id_usuario: `eq.${sess.id}`, limit: 1 });
  const t        = now();
  const id       = uid('CHM');
  const proto    = genProto();

  await db.ins('chamados', {
    id_chamado:       id,
    protocolo:        proto,
    titulo,
    descricao,
    categoria_id:     p.categoria_id,
    subcategoria_id:  p.subcategoria_id || null,
    prioridade:       p.prioridade || 'media',
    status:           'aberto',
    solicitante_id:   sess.id,
    tecnico_id:       null,
    setor_solicitante: p.setor || user?.setor || '',
    canal_origem:     'portal',
    data_abertura:    t,
    data_atualizacao: t,
    sla_resolucao_limite: new Date(Date.now() + slaH * 3600000).toISOString(),
    ativo: true,
  });

  await db.ins('interacoes', {
    id_interacao:  uid('INT'),
    id_chamado:    id,
    autor_id:      sess.id,
    tipo_autor:    'sistema',
    tipo_interacao:'sistema',
    mensagem:      `Chamado aberto por ${user?.nome || sess.email}.`,
    visibilidade:  'publico',
    criado_em:     t,
  });

  if (p.attachment?.base64 && p.attachment?.name)
    await storeFile(env, id, p.attachment, sess.id, t, db);

  log(db, 'chamado', 'criar', id, `Protocolo: ${proto}`, sess.id);
  return R({ ok: true, id_chamado: id, protocolo: proto });
}

async function ticketUpdateStatus(p, sess, db) {
  perm(sess, EDITORS); // gestor NÃO pode alterar status
  if (!p.id_chamado || !p.novo_status)
    return R({ ok: false, error: 'id_chamado e novo_status obrigatórios.' }, 400);

  const [old] = await db.q('chamados', { id_chamado: `eq.${p.id_chamado}`, limit: 1 });
  if (!old) return R({ ok: false, error: 'Chamado não encontrado.' }, 404);

  const t   = now();
  const st  = p.novo_status;
  const fin = ['resolvido','fechado','cancelado'].includes(st);
  const upd = { status: st, data_atualizacao: t };

  if (fin && !old.data_fechamento) {
    upd.data_fechamento   = t;
    upd.sla_resolucao_em  = t;
    upd.tempo_total_horas = ((new Date(t) - new Date(old.data_abertura)) / 3600000).toFixed(2);
  }

  await db.patch('chamados', { id_chamado: p.id_chamado }, upd);
  await db.ins('interacoes', {
    id_interacao:  uid('INT'),
    id_chamado:    p.id_chamado,
    autor_id:      sess.id,
    tipo_autor:    sess.perfil,
    tipo_interacao:'status',
    mensagem:      `Status alterado: "${old.status}" → "${st}".`,
    visibilidade:  'publico',
    status_origem: old.status,
    status_destino:st,
    criado_em:     t,
  });

  return R({ ok: true, status: st });
}

async function ticketAddMessage(p, sess, db, env) {
  const msg = String(p.mensagem || '').trim();
  if (!p.id_chamado || !msg)
    return R({ ok: false, error: 'id_chamado e mensagem obrigatórios.' }, 400);

  // Verificação de acesso
  if (sess.perfil === 'solicitante') {
    const [c] = await db.q('chamados', { id_chamado: `eq.${p.id_chamado}`, solicitante_id: `eq.${sess.id}`, limit: 1 });
    if (!c) return R({ ok: false, error: 'Acesso negado.' }, 403);
  }

  // Gestor só pode mensagem pública
  const t   = now();
  const vis = ['solicitante','gestor'].includes(sess.perfil) ? 'publico' : (p.visibilidade || 'publico');

  if (p.attachment?.base64 && p.attachment?.name)
    await storeFile(env, p.id_chamado, p.attachment, sess.id, t, db);

  await db.ins('interacoes', {
    id_interacao:  uid('INT'),
    id_chamado:    p.id_chamado,
    autor_id:      sess.id,
    tipo_autor:    sess.perfil,
    tipo_interacao:'mensagem',
    mensagem:      msg,
    visibilidade:  vis,
    criado_em:     t,
  });
  await db.patch('chamados', { id_chamado: p.id_chamado }, { data_atualizacao: t });

  // Se solicitante responde em aguardando_usuario → reabrir
  if (sess.perfil === 'solicitante') {
    const [c] = await db.q('chamados', { id_chamado: `eq.${p.id_chamado}`, limit: 1 });
    if (c?.status === 'aguardando_usuario')
      await db.patch('chamados', { id_chamado: p.id_chamado }, { status: 'em_atendimento', data_atualizacao: t });
  }

  return R({ ok: true });
}

async function ticketAssign(p, sess, db) {
  perm(sess, EDITORS); // gestor NÃO pode atribuir
  if (!p.id_chamado) return R({ ok: false, error: 'id_chamado obrigatório.' }, 400);

  const tid   = p.tecnico_id || sess.id;
  const [u]   = await db.q('usuarios', { id_usuario: `eq.${tid}`, limit: 1 });
  const t     = now();

  await db.patch('chamados', { id_chamado: p.id_chamado }, {
    tecnico_id:      tid,
    status:          'em_atendimento',
    data_atualizacao: t,
  });
  await db.ins('interacoes', {
    id_interacao:  uid('INT'),
    id_chamado:    p.id_chamado,
    autor_id:      sess.id,
    tipo_autor:    sess.perfil,
    tipo_interacao:'atribuicao',
    mensagem:      `Chamado atribuído para: ${u?.nome || tid}.`,
    visibilidade:  'publico',
    criado_em:     t,
  });

  return R({ ok: true });
}

// ================================================================
// ADMIN
// ================================================================
async function adminUsers(p, sess, db) {
  perm(sess, [...STAFF]); // gestor pode ver usuários
  const f = {};
  if (p.perfil) f.perfil = `eq.${p.perfil}`;
  const rows = await db.q('usuarios', f);
  return R({ ok: true, items: rows.map(u => ({ ...u, senha_hash: undefined })) });
}

async function adminUserSave(p, sess, db, env) {
  perm(sess, ['admin']); // só admin pode criar/editar usuários
  const nome  = String(p.nome  || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  if (!nome || !email || !p.perfil)
    return R({ ok: false, error: 'Nome, e-mail e perfil são obrigatórios.' }, 400);

  if (p.id_usuario) {
    const upd = { nome, email, setor: p.setor || '', perfil: p.perfil, status: p.status || 'ativo' };
    if (p.senha) upd.senha_hash = await sha256(p.senha + env.JWT_SECRET);
    await db.patch('usuarios', { id_usuario: p.id_usuario }, upd);
    log(db, 'admin', 'user.update', p.id_usuario, email, sess.id);
    return R({ ok: true, id_usuario: p.id_usuario });
  }

  if (!p.senha) return R({ ok: false, error: 'Senha obrigatória para novo usuário.' }, 400);
  const [dup] = await db.q('usuarios', { email: `eq.${email}`, limit: 1 });
  if (dup) return R({ ok: false, error: 'E-mail já cadastrado.' }, 409);

  const id = uid('USR');
  await db.ins('usuarios', {
    id_usuario: id, nome, email,
    senha_hash: await sha256(p.senha + env.JWT_SECRET),
    setor: p.setor || '', perfil: p.perfil,
    status: p.status || 'ativo',
    criado_em: now(), atualizado_em: now(),
  });
  log(db, 'admin', 'user.create', id, email, sess.id);
  return R({ ok: true, id_usuario: id });
}

async function adminCategorySave(p, sess, db) {
  perm(sess, ['admin']); // só admin
  if (!p.nome_categoria) return R({ ok: false, error: 'Nome obrigatório.' }, 400);
  if (p.id_categoria) {
    await db.patch('categorias', { id_categoria: p.id_categoria }, {
      nome_categoria: p.nome_categoria, ativo: p.ativo !== false,
    });
  } else {
    await db.ins('categorias', {
      id_categoria: uid('CAT'), nome_categoria: p.nome_categoria,
      icone: p.icone || '📁', ativo: true, ordem: 99,
    });
  }
  return R({ ok: true });
}

async function adminRegistrations(p, sess, db) {
  perm(sess, ['admin']); // só admin aprova cadastros
  const f = { order: 'criado_em.desc' };
  if (p.status) f.status = `eq.${p.status}`;
  const rows = await db.q('cadastros_pendentes', f);
  return R({ ok: true, items: rows.map(r => ({ ...r, senha_hash: undefined })) });
}

async function adminRegistrationAction(p, sess, db, env) {
  perm(sess, ['admin']);
  const { id_cadastro, acao } = p;
  if (!id_cadastro || !['aprovar','rejeitar'].includes(acao))
    return R({ ok: false, error: 'id_cadastro e acao (aprovar/rejeitar) obrigatórios.' }, 400);

  const [cad] = await db.q('cadastros_pendentes', { id_cadastro: `eq.${id_cadastro}`, limit: 1 });
  if (!cad) return R({ ok: false, error: 'Solicitação não encontrada.' }, 404);
  if (cad.status !== 'pendente') return R({ ok: false, error: 'Solicitação já foi avaliada.' }, 409);

  if (acao === 'aprovar') {
    const [dup] = await db.q('usuarios', { email: `eq.${cad.email}`, limit: 1 });
    if (dup) {
      await db.patch('cadastros_pendentes', { id_cadastro }, { status: 'rejeitado', avaliado_em: now(), avaliado_por: sess.id });
      return R({ ok: false, error: 'E-mail já cadastrado.' }, 409);
    }
    const newId = uid('USR');
    await db.ins('usuarios', {
      id_usuario: newId, nome: cad.nome, email: cad.email,
      senha_hash: cad.senha_hash, setor: cad.setor,
      perfil: 'solicitante', status: 'ativo',
      criado_em: now(), atualizado_em: now(),
    });
    await db.patch('cadastros_pendentes', { id_cadastro }, { status: 'aprovado', avaliado_em: now(), avaliado_por: sess.id });
    log(db, 'admin', 'cadastro.aprovado', newId, cad.email, sess.id);
    return R({ ok: true, message: 'Acesso aprovado. Usuário já pode fazer login.' });
  }

  await db.patch('cadastros_pendentes', { id_cadastro }, { status: 'rejeitado', avaliado_em: now(), avaliado_por: sess.id });
  log(db, 'admin', 'cadastro.rejeitado', id_cadastro, cad.email, sess.id);
  return R({ ok: true, message: 'Solicitação rejeitada.' });
}

// ================================================================
// SUPABASE CLIENT
// ================================================================
class DB {
  constructor(url, key) {
    this.base = (url || '').replace(/\/$/, '');
    this.h = {
      apikey:        key,
      Authorization: `Bearer ${key}`,
      'Content-Type':'application/json',
      Prefer:        'return=representation',
    };
  }

  async q(table, f = {}) {
    const u   = new URL(`${this.base}/rest/v1/${table}`);
    const ord = f.order;  delete f.order;
    const lim = f.limit;  delete f.limit;
    const sel = f.select; delete f.select;
    u.searchParams.set('select', sel || '*');
    if (ord) u.searchParams.set('order', ord);
    if (lim) u.searchParams.set('limit', String(lim));
    Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, v); });
    const r = await fetch(u.toString(), { headers: this.h });
    if (!r.ok) throw new Error(`[DB] ${table} ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async ins(table, data) {
    const r = await fetch(`${this.base}/rest/v1/${table}`, {
      method: 'POST', headers: this.h, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`[DB.ins] ${table} ${r.status}: ${await r.text()}`);
    const t = await r.text();
    try { return JSON.parse(t); } catch { return []; }
  }

  async patch(table, match, data) {
    const u = new URL(`${this.base}/rest/v1/${table}`);
    Object.entries(match).forEach(([k, v]) => u.searchParams.set(k, `eq.${v}`));
    const r = await fetch(u.toString(), {
      method: 'PATCH', headers: this.h, body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`[DB.patch] ${table} ${r.status}: ${await r.text()}`);
    const t = await r.text();
    try { return JSON.parse(t); } catch { return []; }
  }
}

// ================================================================
// STORAGE
// ================================================================
async function storeFile(env, chamadoId, att, userId, t, db) {
  try {
    const ext  = (att.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${chamadoId}/${uid('ANX')}.${ext}`;
    const bin  = Uint8Array.from(atob(att.base64), c => c.charCodeAt(0));
    const r    = await fetch(`${env.SUPABASE_URL}/storage/v1/object/ziran-anexos/${path}`, {
      method:  'POST',
      headers: {
        apikey:        env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': att.mimeType || 'application/octet-stream',
        'x-upsert':    'true',
      },
      body: bin,
    });
    if (!r.ok) throw new Error(await r.text());
    const url = `${env.SUPABASE_URL}/storage/v1/object/public/ziran-anexos/${path}`;
    await db.ins('anexos', {
      id_anexo:    uid('ANX'), id_chamado: chamadoId,
      nome_arquivo: att.name, url_arquivo: url,
      tipo_arquivo: att.mimeType || 'application/octet-stream',
      tamanho_kb:  att.sizeKb || 0, enviado_por: userId,
      criado_em:   t, ativo: true,
    });
  } catch (e) { console.error('[Storage]', e.message); }
}

// ================================================================
// JWT — HMAC-SHA256
// ================================================================
async function signJWT(payload, secret) {
  const h   = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b   = b64u(JSON.stringify({ ...payload, iat: ts(), exp: ts() + 28800 }));
  const sig = await hmac(`${h}.${b}`, secret);
  return `${h}.${b}.${sig}`;
}

async function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  try {
    const [h, b, sig] = token.split('.');
    if (!h || !b || !sig) return null;
    if (await hmac(`${h}.${b}`, secret) !== sig) return null;
    const pl = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    if (pl.exp < ts()) return null;
    return pl;
  } catch { return null; }
}

async function hmac(msg, secret) {
  const k = await crypto.subtle.importKey('raw', enc(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc(msg));
  return btoa(String.fromCharCode(...new Uint8Array(s)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function b64u(s) {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// ================================================================
// UTILS
// ================================================================
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', enc(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
}

const enc = s => new TextEncoder().encode(s);
const ts  = ()  => Math.floor(Date.now() / 1000);
const now = ()  => new Date().toISOString();

function uid(pfx) {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const r = Math.random().toString(36).slice(2,8).toUpperCase();
  return `${pfx}-${d}-${r}`;
}

function genProto() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  return `CHM-${d}-${String(Math.floor(Math.random()*9000)+1000)}`;
}

function log(db, modulo, acao, ref, desc, uid2) {
  db.ins('log_auditoria', {
    id_log: uid('LOG'), modulo, acao,
    referencia_id: ref, descricao: desc,
    usuario_id: uid2, criado_em: now(),
  }).catch(() => {});
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function R(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', ...CORS },
  });
}
