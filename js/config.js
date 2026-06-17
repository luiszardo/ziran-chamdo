// ================================================================
// ZIRAN DESK v3 Premium — Config + UI Utilities
// ================================================================
window.APP_CONFIG = {
  APP_NAME:    'Ziran Desk',
  API_BASE_URL: '/api',
  STORAGE_KEY:  'zd_v3_session',
};

// ── Toast ─────────────────────────────────────────────────────────
window.Toast = (() => {
  let _c;
  const get = () => {
    if (!_c) {
      _c = document.createElement('div');
      Object.assign(_c.style, { position:'fixed', bottom:'24px', right:'24px', zIndex:'9999', display:'flex', flexDirection:'column', gap:'8px', pointerEvents:'none' });
      document.body.appendChild(_c);
    }
    return _c;
  };
  const icons = { success:'✓', error:'✕', warning:'⚠', info:'i' };
  const colors= { success:'#16a34a', error:'#dc2626', warning:'#d97706', info:'#2563eb' };

  function show(msg, type='info', dur=4000) {
    const el = document.createElement('div');
    el.style.cssText = `display:flex;align-items:center;gap:12px;padding:13px 18px;background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${colors[type]};border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.10);min-width:280px;max-width:380px;pointer-events:all;opacity:0;transform:translateX(24px);transition:all .25s cubic-bezier(.34,1.56,.64,1);font-size:14px;font-family:inherit;color:#111827;`;
    el.innerHTML = `<span style="width:20px;height:20px;border-radius:50%;background:${colors[type]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">${icons[type]}</span><span style="flex:1;line-height:1.4;">${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#9ca3af;padding:0;flex-shrink:0;">×</button>`;
    get().appendChild(el);
    requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateX(0)'; });
    if (dur > 0) setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(24px)'; setTimeout(() => el.remove(), 280); }, dur);
  }
  return {
    success: m => show(m,'success'),
    error:   m => show(m,'error'),
    warning: m => show(m,'warning'),
    info:    m => show(m,'info'),
  };
})();

// ── Skeleton ──────────────────────────────────────────────────────
window.Skeleton = {
  rows: (n=4, cols=5) => Array.from({length:n}, () =>
    `<tr>${Array.from({length:cols}, () => '<td><div class="skel" style="height:14px;border-radius:6px;"></div></td>').join('')}</tr>`
  ).join(''),
};

// ── Formatters ────────────────────────────────────────────────────
window.Fmt = {
  date(v, short=false) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ','T'));
    if (isNaN(d)) return v;
    return short
      ? d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})
      : d.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  },
  ago(v) {
    if (!v) return '';
    const s = Math.floor((Date.now() - new Date(v))/1000);
    if (s < 60)    return `${s}s atrás`;
    if (s < 3600)  return `${Math.floor(s/60)}m atrás`;
    if (s < 86400) return `${Math.floor(s/3600)}h atrás`;
    return `${Math.floor(s/86400)}d atrás`;
  },
  escape(s) {
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
  initials(nome='') {
    return String(nome).split(' ').slice(0,2).map(n=>n[0]||'').join('').toUpperCase() || '?';
  },
};

// ── Badge helpers ─────────────────────────────────────────────────
const STATUS_MAP = {
  aberto:             { label:'Aberto',             cls:'st-aberto'      },
  em_analise:         { label:'Em análise',         cls:'st-analise'     },
  em_atendimento:     { label:'Em atendimento',     cls:'st-atendimento' },
  aguardando_usuario: { label:'Aguardando usuário', cls:'st-aguardando'  },
  resolvido:          { label:'Resolvido',          cls:'st-resolvido'   },
  fechado:            { label:'Fechado',            cls:'st-fechado'     },
};
const PRI_MAP = {
  critica: { label:'Crítica', cls:'pri-critica' },
  alta:    { label:'Alta',    cls:'pri-alta'    },
  media:   { label:'Média',   cls:'pri-media'   },
  baixa:   { label:'Baixa',   cls:'pri-baixa'   },
};

window.Badge = {
  status(raw) {
    const m = STATUS_MAP[String(raw||'').toLowerCase()] || { label:raw, cls:'st-fechado' };
    return `<span class="badge ${m.cls}">${m.label}</span>`;
  },
  priority(raw) {
    const m = PRI_MAP[String(raw||'').toLowerCase()] || { label:raw, cls:'pri-baixa' };
    return `<span class="badge ${m.cls}">${m.label}</span>`;
  },
  label(raw) {
    return STATUS_MAP[raw]?.label || PRI_MAP[raw]?.label || raw || '—';
  },
  toRaw(label) {
    const map = {
      'Aberto':'aberto','Em análise':'em_analise','Em atendimento':'em_atendimento',
      'Aguardando usuário':'aguardando_usuario','Resolvido':'resolvido','Fechado':'fechado',
      'Crítica':'critica','Alta':'alta','Média':'media','Baixa':'baixa',
    };
    return map[label] || String(label||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
  },
  perfil(p) {
    const map = { admin:'role-admin', tecnico:'role-tecnico', gestor:'role-gestor', solicitante:'role-solicit' };
    const labels = { admin:'🛡️ Admin', tecnico:'🔧 Técnico', gestor:'👁️ Gestor', solicitante:'👤 Solicitante' };
    return `<span class="badge ${map[p]||'role-solicit'}">${labels[p]||p}</span>`;
  },
};

// ── Button loading ────────────────────────────────────────────────
window.loadBtn = function(btn, loading) {
  if (!btn) return;
  if (loading) { btn.disabled=true; btn._orig=btn.innerHTML; btn.innerHTML='<span class="spinner"></span>'; }
  else         { btn.disabled=false; btn.innerHTML=btn._orig||btn.innerHTML; }
};

// ── Sidebar mobile ────────────────────────────────────────────────
window.initSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('show');
  });
  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('show');
  });
};
