// ================================================================
// ZIRAN DESK v3 — Admin Module
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  const sess = Auth.enforce();
  if (!sess) return;
  initSidebar();

  // Tab switching
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-tab]').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('[id^="tab-"]').forEach(el=>el.style.display='none');
      const t = document.getElementById(`tab-${tab.dataset.tab}`);
      if (t) { t.style.display='block'; }
      if (tab.dataset.tab==='categorias')  loadCategories();
      if (tab.dataset.tab==='registros')   loadRegistrations();
    });
  });

  document.getElementById('userForm')?.addEventListener('submit',     submitUser);
  document.getElementById('userReset')?.addEventListener('click',     resetUserForm);
  document.getElementById('categoryForm')?.addEventListener('submit', submitCategory);
  document.getElementById('catReset')?.addEventListener('click',      resetCategoryForm);

  loadUsers();
  loadRegistrationsBadge();
});

// ================================================================
// USERS
// ================================================================
async function loadUsers() {
  const body = document.getElementById('usersBody');
  if (!body) return;
  body.innerHTML = Skeleton.rows(4, 5);
  try {
    const r = await API.adminUsers();
    renderUsers(r.data);
  } catch(e) { Toast.error(e.message); }
}

const PERFIL_LABELS = { admin:'🛡️ Admin', tecnico:'🔧 Técnico', gestor:'👁️ Gestor', solicitante:'👤 Solicitante' };

function renderUsers(users) {
  const body = document.getElementById('usersBody');
  if (!users.length) { body.innerHTML='<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><h4>Nenhum usuário</h4></div></td></tr>'; return; }
  body.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--red),var(--red-2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">${Fmt.initials(u.nome)}</div>
          <div><div style="font-weight:700;font-size:13.5px;">${Fmt.escape(u.nome)}</div><div style="font-size:12px;color:var(--muted);">${Fmt.escape(u.email)}</div></div>
        </div>
      </td>
      <td style="color:var(--muted);font-size:13px;">${Fmt.escape(u.setor||'—')}</td>
      <td>${Badge.perfil(u.perfil)}</td>
      <td>${u.status==='ativo'?'<span class="badge st-resolvido">✅ Ativo</span>':'<span class="badge st-fechado">🚫 Inativo</span>'}</td>
      <td><button class="btn ghost xs" onclick='fillUser(${JSON.stringify(u).replace(/"/g,"&quot;")})'>✏️ Editar</button></td>
    </tr>
  `).join('');
}

function fillUser(u) {
  document.getElementById('userId').value    = u.id_usuario;
  document.getElementById('uNome').value     = u.nome;
  document.getElementById('uEmail').value    = u.email;
  document.getElementById('uSetor').value    = u.setor||'';
  document.getElementById('uPerfil').value   = u.perfil;
  document.getElementById('uStatus').value   = u.status;
  document.getElementById('uSenha').value    = '';
  document.getElementById('userFormTitle').textContent = '✏️ Editar usuário';
  document.getElementById('userReset').style.display  = 'inline-flex';
  document.getElementById('uNome').scrollIntoView({behavior:'smooth',block:'center'});
}

function resetUserForm() {
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  document.getElementById('userFormTitle').textContent = 'Novo usuário';
  document.getElementById('userReset').style.display  = 'none';
  document.getElementById('userError').textContent    = '';
}

async function submitUser(e) {
  e.preventDefault();
  const err = document.getElementById('userError');
  const btn = document.getElementById('userSubmit');
  err.textContent = '';
  const id    = document.getElementById('userId').value.trim();
  const nome  = document.getElementById('uNome').value.trim();
  const email = document.getElementById('uEmail').value.trim();
  const senha = document.getElementById('uSenha').value;
  if (!nome||!email) { err.textContent='Nome e e-mail obrigatórios.'; return; }
  if (!id && !senha) { err.textContent='Senha obrigatória para novo usuário.'; return; }
  loadBtn(btn, true);
  try {
    await API.adminUserSave({ id_usuario:id||undefined, nome, email, setor:document.getElementById('uSetor').value, perfil:document.getElementById('uPerfil').value, status:document.getElementById('uStatus').value, senha:senha||undefined });
    Toast.success(id?'Usuário atualizado!':'Usuário criado!');
    resetUserForm();
    loadUsers();
  } catch(ex) { err.textContent=ex.message; Toast.error(ex.message); }
  finally { loadBtn(btn, false); }
}

// ================================================================
// CATEGORIES
// ================================================================
async function loadCategories() {
  const list = document.getElementById('categoriesList');
  if (!list) return;
  list.innerHTML = '<div class="skel" style="height:44px;border-radius:12px;"></div>'.repeat(4);
  try {
    const r = await API.adminCategories();
    renderCategories(r.data);
  } catch(e) { Toast.error(e.message); }
}

function renderCategories(cats) {
  const list = document.getElementById('categoriesList');
  if (!cats.length) { list.innerHTML='<div class="empty-state"><div class="empty-icon">🏷️</div><h4>Nenhuma categoria</h4></div>'; return; }
  list.innerHTML = cats.map(c => `
    <div class="simple-item">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">${c.icone||'📁'}</span>
        <span style="font-weight:600;">${Fmt.escape(c.nome_categoria)}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${c.ativo?'<span class="badge st-resolvido">Ativo</span>':'<span class="badge st-fechado">Inativo</span>'}
        <button class="btn ghost xs" onclick='fillCategory(${JSON.stringify(c).replace(/"/g,"&quot;")})'>✏️</button>
      </div>
    </div>
  `).join('');
}

function fillCategory(c) {
  document.getElementById('catId').value    = c.id_categoria;
  document.getElementById('catNome').value  = c.nome_categoria;
  document.getElementById('catAtivo').value = String(c.ativo);
  document.getElementById('catSubmit').textContent   = 'Atualizar';
  document.getElementById('catReset').style.display  = 'inline-flex';
}

function resetCategoryForm() {
  document.getElementById('categoryForm').reset();
  document.getElementById('catId').value = '';
  document.getElementById('catSubmit').textContent  = 'Salvar';
  document.getElementById('catReset').style.display = 'none';
  document.getElementById('catError').textContent   = '';
}

async function submitCategory(e) {
  e.preventDefault();
  const err  = document.getElementById('catError');
  const btn  = document.getElementById('catSubmit');
  const nome = document.getElementById('catNome').value.trim();
  if (!nome) { err.textContent='Nome obrigatório.'; return; }
  loadBtn(btn, true);
  try {
    await API.adminCategorySave({ id_categoria:document.getElementById('catId').value||undefined, nome_categoria:nome, ativo:document.getElementById('catAtivo').value==='true' });
    Toast.success('Categoria salva!');
    resetCategoryForm();
    loadCategories();
  } catch(ex) { err.textContent=ex.message; }
  finally { loadBtn(btn, false); }
}

// ================================================================
// REGISTRATIONS
// ================================================================
async function loadRegistrationsBadge() {
  try {
    const r = await API.adminRegistrations('pendente');
    const n = r.data.length;
    const tab = document.getElementById('tabRegistros');
    if (tab) tab.textContent = n>0 ? `🔔 Cadastros (${n})` : '🔔 Cadastros';
  } catch(e) { /* silently */ }
}

async function loadRegistrations() {
  const body = document.getElementById('registrationsBody');
  if (!body) return;
  body.innerHTML = Skeleton.rows(3, 6);
  try {
    const r = await API.adminRegistrations();
    renderRegistrations(r.data);
  } catch(e) { Toast.error('Erro: '+e.message); }
}

function renderRegistrations(items) {
  const body = document.getElementById('registrationsBody');
  if (!items.length) { body.innerHTML='<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🔔</div><h4>Nenhuma solicitação</h4><p>Novas solicitações aparecerão aqui.</p></div></td></tr>'; return; }
  const sBadge = s => ({ pendente:'<span class="badge st-analise">⏳ Pendente</span>', aprovado:'<span class="badge st-resolvido">✅ Aprovado</span>', rejeitado:'<span class="badge st-fechado">❌ Rejeitado</span>' })[s]||s;
  body.innerHTML = items.map(r => `
    <tr>
      <td style="font-weight:700;">${Fmt.escape(r.nome)}</td>
      <td style="color:var(--muted);font-size:13px;">${Fmt.escape(r.email)}</td>
      <td style="color:var(--muted);font-size:13px;">${Fmt.escape(r.setor)}</td>
      <td style="color:var(--muted);font-size:13px;">${Fmt.date(r.criado_em)}</td>
      <td>${sBadge(r.status)}</td>
      <td>${r.status==='pendente'
        ? `<div style="display:flex;gap:6px;">
            <button class="btn primary xs" data-id="${r.id_cadastro}" onclick="doApprove(this)">✅ Aprovar</button>
            <button class="btn danger xs"  data-id="${r.id_cadastro}" onclick="doReject(this)">❌ Rejeitar</button>
           </div>`
        : '—'
      }</td>
    </tr>
  `).join('');
}

async function doApprove(btn) {
  const id = btn.dataset.id;
  if (!confirm('Aprovar este cadastro?')) return;
  loadBtn(btn, true);
  try {
    await API.adminRegistrationAction(id, 'aprovar');
    Toast.success('Acesso aprovado! Usuário já pode fazer login.');
    loadRegistrations(); loadUsers(); loadRegistrationsBadge();
  } catch(e) { Toast.error(e.message); loadBtn(btn, false); }
}

async function doReject(btn) {
  const id = btn.dataset.id;
  if (!confirm('Rejeitar esta solicitação?')) return;
  loadBtn(btn, true);
  try {
    await API.adminRegistrationAction(id, 'rejeitar');
    Toast.warning('Solicitação rejeitada.');
    loadRegistrations(); loadRegistrationsBadge();
  } catch(e) { Toast.error(e.message); loadBtn(btn, false); }
}
