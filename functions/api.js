// functions/api.js
// 只輸出 Express App，Firebase 包裝改由 v2 的 index.js onRequest 處理

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { admin } = require('./src/admin');
const {
  createDraft, updateDraft, sendForSign, getById, listContracts
} = require('./src/services/contracts.store');
const {
  createTemplate, updateTemplate, getTemplate, listTemplates
} = require('./src/services/templates.store');
const { uploadPDF } = require('./src/services/driveService');

const app = express();
app.use(cors({ origin: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Auth middleware using Firebase ID tokens (Authorization: Bearer <token>)
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'missing token' });
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Role check: admin or sales via custom claims
function hasRole(user, role) {
  return user?.role === role || user?.admin === true || (user?.roles || []).includes(role);
}
function requireRole(role) {
  return (req, res, next) => {
    if (hasRole(req.user, role)) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

// Routes
app.get('/healthz', (_req, res) => res.send('ok'));

/** ===================== Admin ===================== */
// 建立業務人員帳號，並設置 custom claims: role=sales
app.post('/admin/createSalesUser', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  const user = await admin.auth().createUser({ email, password, displayName });
  await admin.auth().setCustomUserClaims(user.uid, { role: 'sales' });
  res.status(201).json({ uid: user.uid, email: user.email, role: 'sales' });
});

/** ===================== Templates ===================== */
app.post('/templates', requireAuth, requireRole('sales'), async (req, res) => {
  const tpl = await createTemplate(req.body || {}, req.user.uid);
  res.status(201).json(tpl);
});

app.get('/templates', requireAuth, requireRole('sales'), async (req, res) => {
  const list = await listTemplates(req.user.uid);
  res.json(list);
});

app.get('/templates/:id', requireAuth, requireRole('sales'), async (req, res) => {
  const t = await getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.patch('/templates/:id', requireAuth, requireRole('sales'), async (req, res) => {
  const t = await updateTemplate(req.params.id, req.body || {});
  res.json(t);
});

/** ===================== Contracts ===================== */
app.post('/contracts', requireAuth, requireRole('sales'), async (req, res) => {
  const draft = await createDraft(req.body || {}, req.user.uid);
  res.status(201).json(draft);
});

app.get('/contracts', requireAuth, requireRole('sales'), async (req, res) => {
  const mine = req.query.mine !== 'false';
  const months = Number(req.query.months || 6);
  const list = await listContracts(months, mine ? req.user.uid : null);
  res.json(list);
});

app.post('/contracts/:id/send', requireAuth, requireRole('sales'), async (req, res) => {
  const sent = await sendForSign(req.params.id);
  const base = process.env.PUBLIC_BASE_URL;
  const signToken = sent.signToken;
  const signUrl = base ? `${base}/sign/${signToken}` : `/sign/${signToken}`;
  res.json({ ...sent, signToken, signUrl });
});

app.post('/admin/setAdminRole', requireAuth, requireRole('admin'), async (req, res) => {
  const { uid, admin: isAdmin } = (req.body || {});
  if (!uid || typeof isAdmin === 'undefined') return res.status(400).json({ error: 'uid and admin(boolean) required' });
  try {
    const user = await admin.auth().getUser(uid);
    const oldClaims = user.customClaims || {};
    const newClaims = { ...oldClaims, admin: Boolean(isAdmin) };
    await admin.auth().setCustomUserClaims(uid, newClaims);
    res.json({ ok: true, uid, claims: newClaims });
  } catch (e) {
    console.error('setAdminRole error', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 可選：Drive 上傳 PDF；若使用 Storage 自動產生 PDF，此端點為後備
app.post('/contracts/:id/pdf', requireAuth, requireRole('admin'), async (req, res) => {
  const { pdfBase64 } = (req.body || {});
  if (!pdfBase64) return res.status(400).json({ error: 'missing pdfBase64' });

  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) return res.status(500).json({ error: 'DRIVE_FOLDER_ID not set' });

  const buffer = Buffer.from(pdfBase64, 'base64');
  try {
    const file = await uploadPDF(buffer, `contract-${req.params.id}.pdf`, folderId);
    res.json({ ok: true, drive: file });
  } catch (e) {
    console.error('Drive upload error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = { api: app };
