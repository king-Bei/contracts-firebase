// Dashboard script for admin and staff pages
let auth, app, currentUser, currentClaims = {}, templatesMap = {};
(async () => {
  // === 🔧 已套入你的 Firebase Web App 設定 ===
  const config = {
    apiKey: "AIzaSyBMFhq1ww67VwHGg2IOiC5zPepNpGI5G2w",
    authDomain: "contracttraveljollify.firebaseapp.com",
    projectId: "contracttraveljollify",
    storageBucket: "contracttraveljollify.firebasestorage.app",
    messagingSenderId: "353005945979",
    appId: "1:353005945979:web:86d86bd18402743173cede",
    measurementId: "G-0V0EF3WJSG",
  };

  await new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = "https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js";
    s.onload = async () => {
      const s2 = document.createElement('script');
      s2.src = "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth-compat.js";
      s2.onload = resolve;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });

  app = firebase.initializeApp(config);
  auth = firebase.auth();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async () => { await auth.signOut(); };

  document.querySelectorAll('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  const createSalesBtn = document.getElementById('createSalesBtn');
  if (createSalesBtn) {
    createSalesBtn.onclick = async () => {
      const payload = {
        email: document.getElementById('salesEmail').value,
        password: document.getElementById('salesPassword').value,
        displayName: document.getElementById('salesDisplayName').value
      };
      const res = await api('/admin/createSalesUser', 'POST', payload);
      document.getElementById('adminOut').textContent = JSON.stringify(res, null, 2);
    };
  }

  const createTplBtn = document.getElementById('createTplBtn');
  if (createTplBtn) {
    createTplBtn.onclick = async () => {
      const fields = document.getElementById('tplFields').value
        .split(',').map(s => s.trim()).filter(Boolean);
      const payload = {
        name: document.getElementById('tplName').value,
        body: document.getElementById('tplBody').value,
        fields
      };
      await api('/templates', 'POST', payload);
      await loadTemplates();
    };
  }

  const createContractBtn = document.getElementById('createContractBtn');
  if (createContractBtn) {
    createContractBtn.onclick = async () => {
      const payload = collectContractForm();
      const res = await api('/contracts', 'POST', payload);
      document.getElementById('sendOut').textContent = JSON.stringify(res, null, 2);
      window._lastCreatedId = res.id;
      await loadList();
    };
  }

  const sendContractBtn = document.getElementById('sendContractBtn');
  if (sendContractBtn) {
    sendContractBtn.onclick = async () => {
      const id = window._lastCreatedId;
      if (!id) { alert('請先建立合約'); return; }
      const res = await api(`/contracts/${id}/send`, 'POST');
      document.getElementById('sendOut').textContent = JSON.stringify(res, null, 2);
    };
  }

  const refreshListBtn = document.getElementById('refreshList');
  if (refreshListBtn) refreshListBtn.onclick = loadList;

  auth.onAuthStateChanged(async (u) => {
    currentUser = u;
    if (!u) {
      location.href = '/login.html';
      return;
    }
    const me = document.getElementById('me');
    if (me) me.textContent = `已登入：${u.email}`;
    const tokenResult = await u.getIdTokenResult();
    currentClaims = tokenResult.claims || {};
    updateNav();
    await loadTemplates();
    await loadList();
  });

  const tplSelect = document.getElementById('tplSelect');
  if (tplSelect) tplSelect.addEventListener('change', renderFields);

  function showView(name) {
    ['admin', 'templates', 'send', 'list'].forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== name);
    });
  }

  async function idToken() {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  }

  async function api(path, method='GET', body) {
    const token = await idToken();
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type':'application/json',
        ...(token ? {'Authorization': `Bearer ${token}`} : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t);
    }
    return res.json();
  }

  async function loadTemplates() {
    const list = await api('/templates');
    templatesMap = {};
    const ul = document.getElementById('tplList');
    if (ul) ul.innerHTML = '';
    const sel = document.getElementById('tplSelect');
    if (sel) sel.innerHTML = '';
    list.forEach(t => {
      templatesMap[t.id] = t;
      if (ul) {
        const li = document.createElement('li');
        const fieldsStr = (t.fields || []).join(',');
        li.textContent = `${t.name} (${t.id})${fieldsStr ? ' ['+fieldsStr+']' : ''}`;
        ul.appendChild(li);
      }
      if (sel) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        sel.appendChild(opt);
      }
    });
    renderFields();
  }

  function clearTemplates() {
    const ul = document.getElementById('tplList');
    if (ul) ul.innerHTML = '';
    const sel = document.getElementById('tplSelect');
    if (sel) sel.innerHTML = '';
    const df = document.getElementById('dynamicFields');
    if (df) df.innerHTML = '';
  }

  function collectContractForm() {
    const payload = {};
    document.querySelectorAll('#dynamicFields [data-field]').forEach(input => {
      payload[input.dataset.field] = input.value;
    });
    return {
      templateId: document.getElementById('tplSelect').value,
      customerEmail: document.getElementById('customerEmail').value,
      travelerName: payload.travelerName || '',
      agentName: payload.agentName || '',
      idNumber: payload.idNumber || '',
      phone: payload.phone || '',
      address: payload.address || '',
      salesName: payload.salesName || '',
      payload,
      type: 'group'
    };
  }

  function renderFields() {
    const sel = document.getElementById('tplSelect');
    if (!sel) return;
    const id = sel.value;
    const tpl = templatesMap[id] || {};
    const container = document.getElementById('dynamicFields');
    if (!container) return;
    container.innerHTML = '';
    (tpl.fields || []).forEach(f => {
      const div = document.createElement('div');
      const label = document.createElement('label');
      label.textContent = f;
      const input = document.createElement('input');
      input.dataset.field = f;
      div.appendChild(label);
      div.appendChild(input);
      container.appendChild(div);
    });
  }

  function updateNav() {
    const isAdmin = currentClaims.admin === true;
    const isSales = currentClaims.role === 'sales' || isAdmin;
    const adminBtn = document.querySelector('nav button[data-view="admin"]');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
    ['templates','send','list'].forEach(v => {
      const btn = document.querySelector(`nav button[data-view="${v}"]`);
      if (btn) btn.style.display = isSales ? 'inline-block' : 'none';
    });
  }

  async function loadList() {
    const list = await api('/contracts?months=12&mine=true');
    const ul = document.getElementById('list');
    if (!ul) return;
    ul.innerHTML = '';
    list.forEach(item => {
      const link = item.signUrl || (window.location.origin + `/sign/${item.signToken || item.id}`);
      const li = document.createElement('li');
      li.innerHTML = `${new Date(item.createdAt).toISOString().slice(0,10)} · ${item.type} · ${item.travelerName} · <b>${item.status}</b> · <a href="${link}" target="_blank">簽署連結</a>`;
      ul.appendChild(li);
    });
  }

  function clearList() {
    const ul = document.getElementById('list');
    if (ul) ul.innerHTML = '';
  }
})();

// AdminSettings set admin role
const setBtn = document.getElementById('setAdminRoleBtn');
if (setBtn) {
  setBtn.onclick = async () => {
    const uid = document.getElementById('adminTargetUid').value;
    const adminFlag = document.getElementById('adminTargetFlag').value === 'true';
    try {
      const res = await api('/admin/setAdminRole', 'POST', { uid, admin: adminFlag });
      document.getElementById('adminSettingsOut').textContent = JSON.stringify(res, null, 2);
    } catch (e) {
      document.getElementById('adminSettingsOut').textContent = e.message;
    }
  };
}
