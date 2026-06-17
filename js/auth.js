// ================================================================
// ZIRAN DESK v3 — Auth Module
// Perfis: admin | tecnico | gestor | solicitante
// ================================================================
(function () {
  const KEY  = window.APP_CONFIG.STORAGE_KEY;

  const set   = data => localStorage.setItem(KEY, JSON.stringify(data));
  const get   = ()   => { try { return JSON.parse(localStorage.getItem(KEY)||'null'); } catch { return null; } };
  const clear = ()   => localStorage.removeItem(KEY);

  const isValid = s  => !!(s?.user?.id && s?.token);
  const perfil  = s  => s?.user?.perfil || '';
  const isStaff = s  => ['admin','tecnico','gestor'].includes(perfil(s));

  function defaultRoute(user) {
    if (!user) return '/login.html';
    return user.perfil === 'solicitante' ? '/tickets.html' : '/dashboard.html';
  }

  function page() {
    return location.pathname.replace(/\/+$/,'').split('/').pop().replace('.html','') || 'index';
  }

  function go(path) {
    const t = path.startsWith('/') ? path : `/${path}`;
    if (location.pathname.replace(/\/+$/,'') !== t.replace(/\/+$/,''))
      location.replace(t);
  }

  function applyVisibility(sess) {
    const r = perfil(sess);
    document.querySelectorAll('[data-admin-only]').forEach(el  => { if (r!=='admin') el.style.display='none'; });
    document.querySelectorAll('[data-staff-only]').forEach(el  => { if (!['admin','tecnico','gestor'].includes(r)) el.style.display='none'; });
    document.querySelectorAll('[data-editor-only]').forEach(el => { if (!['admin','tecnico'].includes(r)) el.style.display='none'; });
    document.querySelectorAll('[data-gestor-only]').forEach(el => { if (r!=='gestor') el.style.display='none'; });
    document.querySelectorAll('[data-solicit-only]').forEach(el=> { if (r!=='solicitante') el.style.display='none'; });
  }

  function renderUserInfo(user) {
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = Fmt.initials(user.nome));
    document.querySelectorAll('.user-pill-name, #welcomeUser').forEach(el => el.textContent = user.nome);
    const perfis = { admin:'Administrador · TI', tecnico:'Técnico · '+user.setor, gestor:'Gestor · '+user.setor, solicitante:'Solicitante · '+user.setor };
    document.querySelectorAll('.user-pill-role, #welcomeMeta').forEach(el => el.textContent = perfis[user.perfil]||user.perfil);
    // Gestor readonly notice
    if (user.perfil === 'gestor') {
      document.querySelectorAll('.gestor-notice').forEach(el => el.style.display='flex');
    }
  }

  function enforce() {
    const sess = get();
    const p    = page();
    const pub  = ['index','login','register'].includes(p);

    if (pub) {
      if (isValid(sess)) go(defaultRoute(sess.user));
      return sess;
    }

    if (!isValid(sess)) { go('/login.html'); return null; }

    const r = perfil(sess);
    if (p === 'dashboard' && r === 'solicitante') { go('/tickets.html'); return null; }
    if (p === 'admin'     && r !== 'admin')        { go(defaultRoute(sess.user)); return null; }

    renderUserInfo(sess.user);
    applyVisibility(sess);
    document.querySelectorAll('#logoutBtn, .logout-btn').forEach(btn => {
      btn.addEventListener('click', () => { clear(); go('/login.html'); });
    });

    return sess;
  }

  async function handleLogin(email, password) {
    const resp = await API.login(email, password);
    if (!resp?.data?.user || !resp?.data?.token) throw new Error('Resposta inválida.');
    set({ user: resp.data.user, token: resp.data.token });
    go(defaultRoute(resp.data.user));
  }

  document.addEventListener('DOMContentLoaded', () => {
    enforce();

    // Login form
    document.getElementById('loginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const err = document.getElementById('loginError');
      if (err) err.style.display = 'none';
      loadBtn(btn, true);
      try {
        const fd = new FormData(e.target);
        await handleLogin(String(fd.get('email')||'').trim(), String(fd.get('password')||'').trim());
      } catch(ex) {
        if (err) { err.textContent = ex.message; err.style.display = 'block'; }
      } finally { loadBtn(btn, false); }
    });

    // Register form
    document.getElementById('registerForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const err = document.getElementById('registerError');
      if (err) err.style.display = 'none';
      const fd = new FormData(e.target);
      const senha = String(fd.get('password')||'');
      const senha2= String(fd.get('password2')||'');
      if (senha !== senha2) { if(err){err.textContent='As senhas não coincidem.';err.style.display='block';} return; }
      loadBtn(btn, true);
      try {
        await API.register(
          String(fd.get('nome')||'').trim(),
          String(fd.get('email')||'').trim(),
          String(fd.get('setor')||'').trim(),
          senha,
        );
        document.getElementById('formState').style.display  = 'none';
        document.getElementById('successState').style.display = 'block';
      } catch(ex) {
        if (err) { err.textContent = ex.message; err.style.display = 'block'; }
      } finally { loadBtn(btn, false); }
    });
  });

  window.Auth = { get, set, clear, isValid, perfil, isStaff, enforce, defaultRoute };
})();
