// ================================================================
// ZIRAN DESK v3 — Frontend API Module
// ================================================================
(function () {
  const KEY = window.APP_CONFIG.STORAGE_KEY;
  const BASE = window.APP_CONFIG.API_BASE_URL;

  const getSession = () => { try { return JSON.parse(localStorage.getItem(KEY)||'null'); } catch { return null; } };
  const getToken   = () => getSession()?.token || null;

  async function http(url, opts={}) {
    const r = await fetch(url, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Resposta inválida da API.'); }
    if (data.ok === false) throw new Error(data.error || 'Erro desconhecido na API.');
    return data;
  }

  function headers() {
    const h = { 'Content-Type':'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  function GET(action, params={}) {
    const u = new URL(BASE, location.origin);
    u.searchParams.set('action', action);
    const t = getToken();
    if (t) u.searchParams.set('token', t);
    Object.entries(params).forEach(([k,v]) => { if (v!=null&&v!=='') u.searchParams.set(k,v); });
    return http(u.toString(), { method:'GET', headers:headers() });
  }

  function POST(action, body={}) {
    return http(BASE, {
      method:'POST',
      headers: headers(),
      body: JSON.stringify({ action, token: getToken(), ...body }),
    });
  }

  async function fileToBase64(file) {
    if (!file) return null;
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    return { name: file.name, mimeType: file.type||'application/octet-stream', base64, sizeKb: Math.max(1, Math.round(file.size/1024)) };
  }

  // ── Normalizers ────────────────────────────────────────────────
  function normTicket(t) {
    return {
      id_chamado:       t.id_chamado,
      protocolo:        t.protocolo,
      titulo:           t.titulo,
      descricao:        t.descricao || '',
      prioridade:       Badge.label(t.prioridade),
      prioridade_raw:   t.prioridade || '',
      status:           Badge.label(t.status),
      status_raw:       t.status || '',
      data_abertura:    t.data_abertura,
      data_atualizacao: t.data_atualizacao,
      data_fechamento:  t.data_fechamento,
      sla_limite:       t.sla_resolucao_limite || '',
      solicitante_nome: t.solicitante?.nome  || '',
      solicitante_id:   t.solicitante?.id    || t.solicitante_id || '',
      solicitante_setor:t.solicitante?.setor || '',
      setor_solicitante:t.setor_solicitante  || t.solicitante?.setor || '',
      tecnico_nome:     t.tecnico?.nome      || '',
      tecnico_id:       t.tecnico?.id        || t.tecnico_id || '',
      categoria:        t.categoria?.nome    || '',
      categoria_id:     t.categoria?.id      || t.categoria_id || '',
      subcategoria:     t.subcategoria?.nome || '',
    };
  }

  function normInteraction(i) {
    return { ...i, autor_nome: i.autor_nome||'Sistema', data_hora: i.criado_em||i.data_hora||'' };
  }

  // ── Public API ─────────────────────────────────────────────────
  window.API = {
    fileToBase64,

    // Auth
    async login(email, senha) {
      const d = await POST('auth.login', { email, senha });
      return { ok:true, data:{ user:d.user, token:d.token } };
    },
    async register(nome, email, setor, senha) {
      const d = await POST('auth.register', { nome, email, setor, senha });
      return { ok:true, data:d };
    },

    // Meta
    async metadata() {
      const d = await GET('meta.catalogs');
      return { ok:true, data:{ categorias:d.categorias||[], subcategorias:d.subcategorias||[], status:d.status||[], sla:d.sla||[] } };
    },

    // Dashboard
    async dashboard() {
      const d = await GET('dashboard.summary');
      return { ok:true, data:d };
    },

    // Tickets
    async ticketList(params={}) {
      const sess = getSession();
      const d = await GET('ticket.list', {
        status:     Badge.toRaw(params.status||''),
        prioridade: Badge.toRaw(params.prioridade||''),
        busca:      params.search||'',
        setor:      params.setor||'',
        limit:      params.limit||300,
      });
      return { ok:true, data:(d.items||[]).map(normTicket), total:d.total };
    },

    async ticketDetail(id) {
      const [det, cats] = await Promise.all([
        GET('ticket.detail', { id_chamado:id }),
        GET('meta.catalogs'),
      ]);
      return {
        ok:true,
        data:{
          ticket:       normTicket(det.ticket),
          interactions: (det.interacoes||[]).map(normInteraction),
          attachments:  det.anexos||[],
          allowedStatuses: (cats.status||[]).map(s=>({ raw:s.nome_status, label:s.label_status })),
        },
      };
    },

    async ticketCreate(payload) {
      const cats = await GET('meta.catalogs');
      const cat  = (cats.categorias||[]).find(x=>x.nome_categoria===payload.categoria);
      const sub  = (cats.subcategorias||[]).find(x=>x.nome_subcategoria===payload.subcategoria);
      const d    = await POST('ticket.create', {
        titulo:           payload.titulo,
        descricao:        payload.descricao,
        categoria_id:     cat?.id_categoria||'',
        subcategoria_id:  sub?.id_subcategoria||'',
        prioridade:       Badge.toRaw(payload.prioridade||'Média'),
        setor:            payload.setor||'',
        attachment:       payload.attachment||null,
      });
      return { ok:true, data:d };
    },

    async ticketUpdateStatus(id, status) {
      const d = await POST('ticket.updateStatus', { id_chamado:id, novo_status:Badge.toRaw(status) });
      return { ok:true, data:d };
    },

    async ticketAddMessage(id_chamado, mensagem, attachment, visibilidade) {
      const d = await POST('ticket.addMessage', { id_chamado, mensagem, attachment:attachment||null, visibilidade:visibilidade||'publico' });
      return { ok:true, data:d };
    },

    async ticketAssign(id_chamado, tecnico_id) {
      const d = await POST('ticket.assign', { id_chamado, tecnico_id });
      return { ok:true, data:d };
    },

    // Admin
    async adminUsers(params={}) {
      const d = await GET('admin.users', params);
      return { ok:true, data:d.items||[] };
    },
    async adminUserSave(payload) {
      const d = await POST('admin.user.save', payload);
      return { ok:true, data:d };
    },
    async adminCategories() {
      const d = await GET('meta.catalogs');
      return { ok:true, data:d.categorias||[] };
    },
    async adminCategorySave(payload) {
      const d = await POST('admin.category.save', payload);
      return { ok:true, data:d };
    },
    async adminRegistrations(status) {
      const d = await GET('admin.registrations', status ? { status } : {});
      return { ok:true, data:d.items||[] };
    },
    async adminRegistrationAction(id_cadastro, acao) {
      const d = await POST('admin.registration.action', { id_cadastro, acao });
      return { ok:true, data:d };
    },
  };
})();
