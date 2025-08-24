// Login page script
let auth, app;
(async () => {
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

  const loginBtn = document.getElementById('loginBtn');
  loginBtn.onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
      await auth.signInWithEmailAndPassword(email, password);
      await redirectByRole();
    } catch (e) {
      const err = document.getElementById('error');
      if (err) err.textContent = e.message;
    }
  };

  auth.onAuthStateChanged(async (u) => {
    if (u) await redirectByRole();
  });

  async function redirectByRole() {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdTokenResult();
    const claims = token.claims || {};
    if (claims.admin === true) {
      location.href = '/admin.html';
    } else {
      location.href = '/staff.html';
    }
  }
})();
