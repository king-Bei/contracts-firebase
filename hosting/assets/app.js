// Minimal front-end helper for Firebase Auth and calling Functions
let auth, app;
(async () => {
  // === 🔧 已套入你的 Firebase Web App 設定 ===
  const config = {
    apiKey: "AIzaSyBMFhq1ww67VwHGg2IOiC5zPepNpGI5G2w",
  authDomain: "contracttraveljollify.firebaseapp.com",
  projectId: "contracttraveljollify",
  storageBucket: "contracttraveljollify.firebasestorage.app",
  messagingSenderId: "353005945979",
  appId: "1:353005945979:web:86d86bd18402743173cede",
  measurementId: "G-0V0EF3WJSG"
 
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

  document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    await auth.signInWithEmailAndPassword(email, password);
  };
  document.getElementById('logoutBtn').onclick = async () => {
    await auth.signOut();
  };

  document.querySelectorAll('nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('createSalesBtn').onclick = async () => {
    const payload = {
      email: document.getElementById('salesEmail').value,
      password: document.getElementById('salesPassword').value,
      displayName: document.getElementById('salesDisplayName').value
    };
    const res = await api('/admin/createSalesUser', 'POST', payload);
    document.getElementById('adminOut').textContent = JSON.stringify(res, null, 2);
  };

  document.getElementById('createTplBtn').onclick = async () => {
    const payload = {
      name: document.getElementById('tplName').value,
      body: document.getElementById('tplBody').value
    };
    const res = await api('/templates', 'POST', payload);
    await loadTemplates();
  };

  document.getElementById('createContractBtn').onclick = async () => {
    const payload = collectContractForm();
    const res = await api('/contracts', 'POST', payload);
    document.getElementById('sendOut').textContent = JSON.stringify(res, null, 2);
    window._lastCreatedId = res.id;
    await loadList();
  };
  document.getElementById('sendContractBtn').onclick = async () => {
    const id = window._lastCreatedId;
    if (!id) { alert('請先建立合約'); return; }
    const res = await api(`/contracts/${id}/send`, 'POST');
    document.getElementById('sendOut').textContent = JSON.stringify(res, null, 2);
  };

  document.getElementById('refreshList').onclick = loadList;

  auth.onAuthStateChanged(async (u) => {
    currentUser = u;
    document.getElementById('me').textContent = u ? `已登入：${u.email}` : '未登入';
    if (u) {
      await loadTemplates();
      await loadList();
    } else {
      clearList();
      clearTemplates();
    }
  });

  function showView(name) {
    ['admin', 'templates', 'send', 'list'].forEach(v => {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name);
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
    const ul = document.getElementById('tplList');
    ul.innerHTML = '';
    const sel = document.getElementById('tplSelect');
    sel.innerHTML = '';
    list.forEach(t => {
      const li = document.createElement('li');
      li.textContent = `${t.name} (${t.id})`;
      ul.appendChild(li);

      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }

  function clearTemplates() {
    document.getElementById('tplList').innerHTML = '';
    document.getElementById('tplSelect').innerHTML = '';
  }

  function collectContractForm() {
    return {
      templateId: document.getElementById('tplSelect').value,
      customerEmail: document.getElementById('customerEmail').value,
      travelerName: document.getElementById('travelerName').value,
      agentName: document.getElementById('agentName').value,
      idNumber: document.getElementById('idNumber').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      salesName: document.getElementById('salesName').value,
      type: 'group'
    };
  }

  async function loadList() {
    const list = await api('/contracts?months=12&mine=true');
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    list.forEach(item => {
      const link = (window.location.origin + `/sign/${item.id}`);
      const li = document.createElement('li');
      li.innerHTML = `${new Date(item.createdAt).toISOString().slice(0,10)} · ${item.type} · ${item.travelerName} · <b>${item.status}</b> · <a href="${link}" target="_blank">簽署連結</a>`;
      ul.appendChild(li);
    });
  }

  function clearList() {
    document.getElementById('list').innerHTML = '';
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
