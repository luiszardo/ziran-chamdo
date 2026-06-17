// ================================================================
// ZIRAN DESK v3 — Dashboard Premium
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const sess = Auth.enforce();
  if (!sess) return;
  initSidebar();

  const el = document.getElementById('dashDate');
  if (el) el.textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  await loadDashboard();
});

async function loadDashboard() {
  try {
    const r = await API.dashboard();
    const d = r.data;
    renderStats(d.summary);
    renderCategoryList(d.charts.categorias);
    renderPriorityBars(d.charts.prioridades);
    renderSectorAnalysis(d.charts.setores);
    renderTechnicianBars(d.charts.tecnicos);
    renderTrend(d.charts.tendencia);
    renderStatusSummary(d.charts.status);
    renderRecentTable(d);
  } catch(e) {
    Toast.error('Erro ao carregar dashboard: ' + e.message);
  }
}

function renderStats(s) {
  const stats = [
    { id:'statTotal',      val: s.total,         label:'Total de chamados',   bar:'#6b7280' },
    { id:'statAbertos',    val: s.abertos,        label:'Abertos',             bar:'#ef4444' },
    { id:'statAtendimento',val: s.emAtendimento,  label:'Em atendimento',      bar:'#3b82f6' },
    { id:'statResolvidos', val: s.resolvidosMes,  label:'Resolvidos este mês', bar:'#16a34a' },
    { id:'statAguardando', val: s.aguardando,     label:'Aguardando usuário',  bar:'#8b5cf6' },
    { id:'statTempo',      val: s.tempoMedio+'h', label:'Tempo médio resolução',bar:'#d97706' },
  ];
  stats.forEach(({ id, val, bar }) => {
    const el = document.getElementById(id);
    if (el) {
      el.querySelector('.stat-bar')?.setAttribute('style', `background:${bar}`);
      el.querySelector('.stat-value').textContent = val ?? '—';
    }
  });
}

function renderCategoryList(cats) {
  const el = document.getElementById('chartCategorias');
  if (!el || !cats?.length) return;
  const max = cats[0]?.total || 1;
  el.innerHTML = cats.map(c => `
    <div class="setor-bar-item">
      <div class="setor-bar-label">
        <span>${Fmt.escape(c.nome)}</span>
        <span>${c.total}</span>
      </div>
      <div class="setor-bar-track">
        <div class="setor-bar-fill" style="width:${Math.round(c.total/max*100)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderPriorityBars(pris) {
  const el = document.getElementById('chartPrioridades');
  if (!el || !pris?.length) return;
  const labels = { critica:'Crítica', alta:'Alta', media:'Média', baixa:'Baixa' };
  const colors = { critica:'critical', alta:'warning', media:'', baixa:'' };
  const total  = pris.reduce((s,p) => s+p.total, 0) || 1;
  el.innerHTML = pris.map(p => `
    <div class="setor-bar-item">
      <div class="setor-bar-label">
        <span>${labels[p.nome]||p.nome}</span>
        <span>${p.total} (${Math.round(p.total/total*100)}%)</span>
      </div>
      <div class="setor-bar-track">
        <div class="setor-bar-fill ${colors[p.nome]||''}" style="width:${Math.round(p.total/total*100)}%"></div>
      </div>
    </div>
  `).join('');
}

function renderSectorAnalysis(setores) {
  const el = document.getElementById('chartSetores');
  if (!el) return;
  if (!setores?.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><p>Nenhum dado de setor ainda.</p></div>'; return; }
  const max = setores[0]?.total || 1;
  el.innerHTML = setores.map((s, i) => {
    const cls = s.criticos > 0 ? 'critical' : s.abertos > s.total*0.6 ? 'warning' : '';
    return `
      <div class="setor-bar-item" style="padding:10px 0;${i<setores.length-1?'border-bottom:1px solid var(--border);':''}">
        <div class="setor-bar-label" style="margin-bottom:6px;">
          <span style="font-weight:700;">${Fmt.escape(s.setor)}</span>
          <span style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:12px;color:var(--muted);">${s.abertos} abertos</span>
            ${s.criticos > 0 ? `<span class="badge pri-critica" style="font-size:11px;">⚠ ${s.criticos} críticos</span>` : ''}
            <span style="font-weight:800;">${s.total}</span>
          </span>
        </div>
        <div class="setor-bar-track">
          <div class="setor-bar-fill ${cls}" style="width:${Math.round(s.total/max*100)}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTechnicianBars(tecnicos) {
  const el = document.getElementById('chartTecnicos');
  if (!el || !tecnicos?.length) return;
  const max = tecnicos[0]?.total || 1;
  el.innerHTML = tecnicos.map(t => `
    <div class="setor-bar-item">
      <div class="setor-bar-label">
        <span>${Fmt.escape(t.nome)}</span>
        <span>${t.total}</span>
      </div>
      <div class="setor-bar-track">
        <div class="setor-bar-fill" style="width:${Math.round(t.total/max*100)}%;background:linear-gradient(90deg,#3b82f6,#2563eb);"></div>
      </div>
    </div>
  `).join('');
}

function renderTrend(tendencia) {
  const el = document.getElementById('chartTendencia');
  if (!el || !tendencia?.length) return;
  const max = Math.max(...tendencia.map(m=>m.total)) || 1;
  el.innerHTML = `<div class="trend-bar-wrap">${
    tendencia.map(m => `
      <div class="trend-bar-col">
        <div class="trend-bar-val">${m.total}</div>
        <div class="trend-bar" style="height:${Math.max(4, Math.round(m.total/max*90))}px;"></div>
        <div class="trend-bar-label">${m.mes}</div>
      </div>
    `).join('')
  }</div>`;
}

function renderStatusSummary(status) {
  const el = document.getElementById('statusSummary');
  if (!el || !status?.length) return;
  const labels = { aberto:'Aberto', em_analise:'Em análise', em_atendimento:'Em atendimento', aguardando_usuario:'Aguardando', resolvido:'Resolvido', fechado:'Fechado' };
  el.innerHTML = status.map(s => `
    <div class="simple-item">
      <span>${Fmt.escape(labels[s.nome]||s.nome)}</span>
      <strong>${s.total}</strong>
    </div>
  `).join('');
}

async function renderRecentTable(d) {
  const body = document.getElementById('recentBody');
  if (!body) return;
  try {
    const r = await API.ticketList({ limit: 8 });
    const tickets = r.data;
    if (!tickets.length) {
      body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🎫</div><h4>Nenhum chamado</h4></div></td></tr>`;
      return;
    }
    body.innerHTML = tickets.map(t => `
      <tr class="tr-link" onclick="location.href='ticket-detail.html?id=${t.id_chamado}'">
        <td><span class="proto">${Fmt.escape(t.protocolo)}</span></td>
        <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Fmt.escape(t.titulo)}</td>
        <td>${Badge.status(t.status_raw)}</td>
        <td>${Badge.priority(t.prioridade_raw)}</td>
        <td style="color:var(--muted);font-size:13px;">${Fmt.escape(t.setor_solicitante||'—')}</td>
        <td style="color:var(--muted);font-size:13px;">${Fmt.date(t.data_abertura, true)}</td>
      </tr>
    `).join('');
  } catch(e) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">${e.message}</td></tr>`;
  }
}
