// ================================================================
// ZIRAN DESK v3 — Tickets Page
// ================================================================
let meta = { categorias:[], subcategorias:[], status:[] };
let sess, isEditor, isStaff, selectedFile;

document.addEventListener('DOMContentLoaded', async () => {
  sess = Auth.enforce();
  if (!sess) return;
  initSidebar();

  isEditor = ['admin','tecnico'].includes(sess.user.perfil);
  isStaff  = ['admin','tecnico','gestor'].includes(sess.user.perfil);

  // Page title by role
  const titles = { admin:'Central de Chamados', tecnico:'Central de Chamados', gestor:'Visualização de Chamados', solicitante:'Meus Chamados' };
  document.getElementById('pgTitle').textContent = titles[sess.user.perfil] || 'Chamados';

  // Hide staff-only columns for solicitante
  if (!isStaff) document.querySelectorAll('.col-staff').forEach(el => el.style.display='none');
  // Hide editor actions for gestor/solicitante
  if (!isEditor) document.querySelectorAll('.editor-action').forEach(el => el.style.display='none');

  // Filters only visible to staff
  if (!isStaff) document.getElementById('filtersSection')?.style.setProperty('display','none');

  // Modal open button
  document.getElementById('btnNewTicket')?.addEventListener('click', openModal);
  document.getElementById('btnCloseModal')?.addEventListener('click', closeModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeModal);
  document.getElementById('ticketModal')?.addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
  document.getElementById('ticketForm')?.addEventListener('submit', submitTicket);

  // File input
  document.getElementById('ticketFile')?.addEventListener('change', e => {
    selectedFile = e.target.files[0]||null;
    const prev = document.getElementById('filePreview');
    const name = document.getElementById('fileName');
    if (selectedFile && prev && name) {
      name.textContent = `${selectedFile.name} (${(selectedFile.size/1024).toFixed(0)}KB)`;
      prev.style.display = 'flex';
    }
  });
  document.getElementById('btnClearFile')?.addEventListener('click', clearFile);

  // Filters
  document.getElementById('btnFilter')?.addEventListener('click', () => loadTickets());
  document.getElementById('btnClearFilter')?.addEventListener('click', clearFilters);
  document.getElementById('fSearch')?.addEventListener('input', debounce(() => loadTickets(), 400));

  // Open modal from URL
  if (new URLSearchParams(location.search).get('new') === '1') setTimeout(openModal, 200);

  await Promise.all([loadMeta(), loadTickets()]);
});

// ── Meta ──────────────────────────────────────────────────────────
async function loadMeta() {
  try {
    const r = await API.metadata();
    meta = r.data;

    // Status filter
    const fSt = document.getElementById('fStatus');
    if (fSt) {
      fSt.innerHTML = '<option value="">Todos os status</option>';
      meta.status.forEach(s => { const o=document.createElement('option'); o.value=s.label_status; o.textContent=s.label_status; fSt.appendChild(o); });
    }

    // Category select in modal
    const catSel = document.getElementById('ticketCategoria');
    if (catSel) {
      catSel.innerHTML = '<option value="">Selecione...</option>';
      meta.categorias.forEach(c => { const o=document.createElement('option'); o.value=c.nome_categoria; o.textContent=c.nome_categoria; catSel.appendChild(o); });
      catSel.addEventListener('change', syncSub);
    }

    // Pre-fill setor
    const setorEl = document.getElementById('ticketSetor');
    if (setorEl && sess.user.setor) setorEl.value = sess.user.setor;
  } catch(e) { console.warn('Meta load:', e.message); }
}

function syncSub() {
  const cat  = meta.categorias.find(c => c.nome_categoria === document.getElementById('ticketCategoria').value);
  const subs = meta.subcategorias.filter(s => s.id_categoria === cat?.id_categoria);
  const sel  = document.getElementById('ticketSubcategoria');
  if (!sel) return;
  sel.innerHTML = '<option value="">Nenhuma (opcional)</option>';
  subs.forEach(s => { const o=document.createElement('option'); o.value=s.nome_subcategoria; o.textContent=s.nome_subcategoria; sel.appendChild(o); });
}

// ── Load tickets ──────────────────────────────────────────────────
async function loadTickets() {
  const body = document.getElementById('ticketsBody');
  const cols = isStaff ? 8 : 6;
  if (body) body.innerHTML = Skeleton.rows(5, cols);

  try {
    const r = await API.ticketList({
      status:    document.getElementById('fStatus')?.value    || '',
      prioridade:document.getElementById('fPriority')?.value  || '',
      search:    document.getElementById('fSearch')?.value    || '',
      setor:     document.getElementById('fSetor')?.value     || '',
    });
    renderOverview(r.data);
    renderTable(r.data);
  } catch(e) {
    Toast.error(e.message);
    if (body) body.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:32px;color:var(--red);">${e.message}</td></tr>`;
  }
}

function renderOverview(tickets) {
  const el = document.getElementById('overviewGrid');
  if (!el) return;
  const total     = tickets.length;
  const abertos   = tickets.filter(t=>['Aberto','Em análise'].includes(t.status)).length;
  const andamento = tickets.filter(t=>t.status==='Em atendimento').length;
  const urgentes  = tickets.filter(t=>['Alta','Crítica'].includes(t.prioridade)).length;
  const cards     = isStaff
    ? [['Total',total,'Volume geral'],['Abertos',abertos,'Aguardando início'],['Em andamento',andamento,'Em execução'],['Alta prioridade',urgentes,'Atenção imediata']]
    : [['Abertos',abertos,'Aguardando'],['Em andamento',andamento,'Em execução'],['Urgentes',urgentes,'Alta prioridade'],['Total',total,'Todos os meus chamados']];
  el.innerHTML = cards.map(([l,v,d]) => `
    <div class="overview-card">
      <div class="ov-label">${l}</div>
      <div class="ov-value">${v}</div>
      <div class="ov-sub">${d}</div>
    </div>
  `).join('');
}

function renderTable(tickets) {
  const body = document.getElementById('ticketsBody');
  const cols = isStaff ? 8 : 6;
  if (!body) return;

  if (!tickets.length) {
    body.innerHTML = `<tr><td colspan="${cols}"><div class="empty-state"><div class="empty-icon">🎫</div><h4>Nenhum chamado encontrado</h4><p>Abra um novo chamado ou ajuste os filtros.</p></div></td></tr>`;
    return;
  }

  body.innerHTML = tickets.map(t => `
    <tr class="tr-link" onclick="location.href='ticket-detail.html?id=${t.id_chamado}'">
      <td><span class="proto">${Fmt.escape(t.protocolo)}</span></td>
      <td style="font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Fmt.escape(t.titulo)}</td>
      <td>${Badge.status(t.status_raw)}</td>
      <td>${Badge.priority(t.prioridade_raw)}</td>
      ${isStaff ? `<td class="col-staff" style="color:var(--muted);font-size:13px;">${Fmt.escape(t.solicitante_nome||'—')}</td>` : ''}
      ${isStaff ? `<td class="col-staff" style="color:var(--muted);font-size:13px;">${Fmt.escape(t.setor_solicitante||'—')}</td>` : ''}
      ${isStaff ? `<td class="col-staff" style="color:var(--muted);font-size:13px;">${t.tecnico_nome||'<span style="color:var(--muted-2);">Não atribuído</span>'}</td>` : ''}
      <td style="color:var(--muted);font-size:13px;">${Fmt.date(t.data_abertura,true)}</td>
      <td><a href="ticket-detail.html?id=${t.id_chamado}" class="btn ghost xs" onclick="event.stopPropagation()">Ver →</a></td>
    </tr>
  `).join('');
}

// ── Filters ───────────────────────────────────────────────────────
function clearFilters() {
  ['fStatus','fPriority','fSearch','fSetor'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  loadTickets();
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('ticketModal')?.classList.add('open');
  syncSub();
}
function closeModal() {
  document.getElementById('ticketModal')?.classList.remove('open');
  document.getElementById('ticketForm')?.reset();
  clearFile();
  document.getElementById('ticketError').textContent='';
}
function clearFile() {
  selectedFile = null;
  const f = document.getElementById('ticketFile'); if(f) f.value='';
  const p = document.getElementById('filePreview'); if(p) p.style.display='none';
}

async function submitTicket(e) {
  e.preventDefault();
  const err = document.getElementById('ticketError');
  const btn = document.getElementById('btnSubmitTicket');
  err.textContent = '';

  const fd      = new FormData(e.target);
  const titulo  = String(fd.get('titulo')||'').trim();
  const descr   = String(fd.get('descricao')||'').trim();
  const cat     = String(fd.get('categoria')||'').trim();

  if (!titulo) { err.textContent='Informe o título.'; return; }
  if (!cat)    { err.textContent='Selecione a categoria.'; return; }
  if (!descr)  { err.textContent='Informe a descrição.'; return; }

  loadBtn(btn, true);
  try {
    let attachment = null;
    if (selectedFile) attachment = await API.fileToBase64(selectedFile);

    const r = await API.ticketCreate({
      titulo, descricao: descr, categoria: cat,
      subcategoria: fd.get('subcategoria')||'',
      prioridade:   fd.get('prioridade')||'Média',
      setor:        fd.get('setor')||'',
      attachment,
    });
    Toast.success(`Chamado ${r.data.protocolo} aberto!`);
    closeModal();
    loadTickets();
  } catch(ex) {
    err.textContent = ex.message;
  } finally {
    loadBtn(btn, false);
  }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
