// ================================================================
// ZIRAN DESK v3 — Ticket Detail
// ================================================================
let ticketId, sess, isEditor, currentTicket, replyFile, visReply='publico';

document.addEventListener('DOMContentLoaded', async () => {
  sess = Auth.enforce();
  if (!sess) return;
  initSidebar();

  ticketId = new URLSearchParams(location.search).get('id');
  if (!ticketId) { Toast.error('ID inválido.'); setTimeout(() => location.href='tickets.html', 1500); return; }

  isEditor = ['admin','tecnico'].includes(sess.user.perfil);

  // Gestor notice
  if (sess.user.perfil === 'gestor') {
    document.querySelectorAll('.gestor-notice').forEach(el => el.style.display='flex');
    document.querySelectorAll('[data-editor-only]').forEach(el => el.style.display='none');
  }

  // Status modal
  document.getElementById('btnStatus')?.addEventListener('click',   openStatusModal);
  document.getElementById('btnStatus2')?.addEventListener('click',  openStatusModal);
  document.getElementById('btnAssign')?.addEventListener('click',   openAssignModal);
  document.getElementById('btnAssign2')?.addEventListener('click',  openAssignModal);
  document.getElementById('btnResolve')?.addEventListener('click',  quickResolve);
  document.getElementById('btnResolve2')?.addEventListener('click', quickResolve);
  document.getElementById('saveStatusBtn')?.addEventListener('click', saveStatus);
  document.getElementById('saveAssignBtn')?.addEventListener('click', saveAssign);

  // Visibility toggle
  document.getElementById('visPublic')?.addEventListener('click', () => setVis('publico'));
  document.getElementById('visInternal')?.addEventListener('click', () => setVis('interno'));

  // Reply
  document.getElementById('replyForm')?.addEventListener('submit', sendReply);
  document.getElementById('replyFile')?.addEventListener('change', e => {
    replyFile = e.target.files[0]||null;
    document.getElementById('replyFileName').textContent = replyFile ? replyFile.name : '';
  });

  // Close modals on backdrop
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if(e.target===m) m.classList.remove('open'); }));

  await loadDetail();
});

function setVis(v) {
  visReply = v;
  const pub = document.getElementById('visPublic');
  const int = document.getElementById('visInternal');
  if (pub && int) {
    if (v==='publico') { pub.style.cssText='background:#dbeafe;color:#1e40af;border-color:#bfdbfe;'; int.className='btn xs ghost'; }
    else               { int.style.cssText='background:#fef3c7;color:#92400e;border-color:#fde68a;'; pub.className='btn xs ghost'; }
  }
}

async function loadDetail() {
  try {
    const r = await API.ticketDetail(ticketId);
    currentTicket = r.data.ticket;
    renderDetail(r.data);
  } catch(e) {
    Toast.error('Erro ao carregar chamado: ' + e.message);
  }
}

function renderDetail({ ticket, interactions, attachments, allowedStatuses }) {
  document.title = `${ticket.protocolo} · Ziran Desk`;
  document.getElementById('hdrProtocolo').textContent  = ticket.protocolo;
  document.getElementById('hdrStatus').innerHTML       = Badge.status(ticket.status_raw);
  document.getElementById('hdrPrioridade').innerHTML   = Badge.priority(ticket.prioridade_raw);
  document.getElementById('hdrTitulo').textContent     = ticket.titulo;
  document.getElementById('ticketDesc').textContent    = ticket.descricao;
  document.getElementById('openedAt').textContent      = 'Aberto em ' + Fmt.date(ticket.data_abertura);
  document.getElementById('breadProtocolo').textContent= ticket.protocolo;

  // Meta
  document.getElementById('metaList').innerHTML = [
    ['Protocolo',   `<span class="proto">${ticket.protocolo}</span>`],
    ['Status',      Badge.status(ticket.status_raw)],
    ['Prioridade',  Badge.priority(ticket.prioridade_raw)],
    ['Categoria',   Fmt.escape(ticket.categoria)],
    ['Subcategoria',Fmt.escape(ticket.subcategoria||'—')],
    ['Solicitante', Fmt.escape(ticket.solicitante_nome)],
    ['Setor',       Fmt.escape(ticket.setor_solicitante||ticket.solicitante_setor||'—')],
    ['Técnico',     ticket.tecnico_nome||'<span style="color:var(--muted-2);">Não atribuído</span>'],
    ['SLA',         ticket.sla_limite ? (() => { const ok=new Date(ticket.sla_limite)>new Date(); return `<span style="color:${ok?'var(--green)':'var(--red)'};font-weight:700;">${ok?'✓ OK':'⚠ Vencido'} · ${Fmt.date(ticket.sla_limite)}</span>`; })() : '—'],
    ['Abertura',    Fmt.date(ticket.data_abertura)],
    ['Atualização', Fmt.date(ticket.data_atualizacao)],
    ['Fechamento',  ticket.data_fechamento ? Fmt.date(ticket.data_fechamento) : '—'],
  ].map(([l,v]) => `<div class="detail-row"><span class="dr-label">${l}</span><span class="dr-value">${v}</span></div>`).join('');

  // Anexos
  if (attachments.length) {
    document.getElementById('attachCard').style.display = 'block';
    document.getElementById('attachList').innerHTML = attachments.map(a =>
      `<a href="${a.url_arquivo}" target="_blank" rel="noopener" class="attach-link">📎 ${Fmt.escape(a.nome_arquivo)}</a>`
    ).join('');
  }

  // Timeline
  const tl = document.getElementById('timeline');
  document.getElementById('intCount').textContent = `${interactions.length} interação${interactions.length!==1?'ões':''}`;
  tl.innerHTML = interactions.length
    ? interactions.map(i => {
        const cls  = `tl-${i.tipo_autor} ${i.visibilidade==='interno'?'tl-interno':''}`;
        return `<div class="tl-item ${cls}">
          <div class="tl-meta">
            <span class="tl-author">${Fmt.escape(i.autor_nome)}</span>
            <span>·</span>
            <span title="${Fmt.date(i.data_hora)}">${Fmt.ago(i.data_hora)}</span>
            ${i.visibilidade==='interno'?'<span class="tl-internal-badge">🔒 Interno</span>':''}
          </div>
          <div class="tl-body">${Fmt.escape(i.mensagem)}</div>
        </div>`;
      }).join('')
    : '<div style="text-align:center;padding:24px;color:var(--muted);">Nenhuma interação.</div>';

  // Status select
  const sel = document.getElementById('statusSelect');
  if (sel) sel.innerHTML = allowedStatuses.map(s =>
    `<option value="${s.label}" ${s.label===ticket.status?'selected':''}>${s.label}</option>`
  ).join('');

  // Disable reply if closed
  if (['fechado','cancelado'].includes(ticket.status_raw) && !isEditor) {
    const rc = document.getElementById('replyCard');
    if (rc) rc.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><h4>Chamado encerrado</h4></div>`;
  }

  // Show/hide editor actions
  if (isEditor) {
    document.querySelectorAll('[data-editor-only]').forEach(el => el.style.display='');
  }

  // Show content
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('detailContent').style.display = 'grid';
}

// ── Reply ──────────────────────────────────────────────────────────
async function sendReply(e) {
  e.preventDefault();
  const msg = document.getElementById('replyMsg').value.trim();
  if (!msg) { document.getElementById('replyError').textContent='Mensagem obrigatória.'; return; }
  const btn = document.getElementById('btnSendReply');
  document.getElementById('replyError').textContent = '';
  loadBtn(btn, true);
  try {
    let att = null;
    if (replyFile) { att = await API.fileToBase64(replyFile); replyFile=null; document.getElementById('replyFileName').textContent=''; }
    await API.ticketAddMessage(ticketId, msg, att, visReply);
    document.getElementById('replyMsg').value = '';
    Toast.success('Resposta enviada!');
    await loadDetail();
  } catch(ex) { document.getElementById('replyError').textContent=ex.message; Toast.error(ex.message); }
  finally { loadBtn(btn, false); }
}

// ── Status modal ───────────────────────────────────────────────────
function openStatusModal() { document.getElementById('statusModal')?.classList.add('open'); }
async function saveStatus() {
  const status  = document.getElementById('statusSelect').value;
  const btn     = document.getElementById('saveStatusBtn');
  loadBtn(btn, true);
  try {
    await API.ticketUpdateStatus(ticketId, status);
    const comment = document.getElementById('statusComment')?.value.trim();
    if (comment) await API.ticketAddMessage(ticketId, comment, null, 'publico');
    Toast.success('Status atualizado!');
    document.getElementById('statusModal').classList.remove('open');
    document.getElementById('statusComment').value = '';
    await loadDetail();
  } catch(e) { Toast.error(e.message); }
  finally { loadBtn(btn, false); }
}

async function quickResolve() {
  if (!confirm('Marcar como Resolvido?')) return;
  try { await API.ticketUpdateStatus(ticketId, 'Resolvido'); Toast.success('Chamado resolvido!'); await loadDetail(); }
  catch(e) { Toast.error(e.message); }
}

// ── Assign modal ───────────────────────────────────────────────────
async function openAssignModal() {
  const sel = document.getElementById('assignSelect');
  if (sel && sel.options.length <= 1) {
    try {
      const r = await API.adminUsers({ perfil:'tecnico' });
      r.data.forEach(u => {
        const o=document.createElement('option'); o.value=u.id_usuario; o.textContent=u.nome;
        if (currentTicket?.tecnico_id===u.id_usuario) o.selected=true;
        sel.appendChild(o);
      });
    } catch(e) { console.warn(e); }
  }
  document.getElementById('assignModal')?.classList.add('open');
}

async function saveAssign() {
  const tid = document.getElementById('assignSelect').value;
  const btn = document.getElementById('saveAssignBtn');
  loadBtn(btn, true);
  try {
    await API.ticketAssign(ticketId, tid||sess.user.id);
    Toast.success('Técnico atribuído!');
    document.getElementById('assignModal').classList.remove('open');
    await loadDetail();
  } catch(e) { Toast.error(e.message); }
  finally { loadBtn(btn, false); }
}
