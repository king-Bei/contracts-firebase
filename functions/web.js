// v2 版 Cloud Functions（Node 20 / CommonJS）
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');

const express = require('express');
const ejs = require('ejs');
const path = require('path');
const cookieParser = require('cookie-parser');

const {
  getByToken,
  recordConsentByToken,
  completeByToken,
} = require('./src/services/contracts.store');

// 設定全域預設（建議放你專案的主要區域）
setGlobalOptions({ region: 'asia-east1' });

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Render sign page by token
app.get('/sign/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const doc = await getByToken(token);
    if (!doc) return res.status(404).send('Link expired or invalid');

    const tpl =
      doc.type === 'individual'
        ? 'tpl_individual.ejs'
        : doc.type === 'flight'
        ? 'tpl_flight.ejs'
        : 'tpl_group.ejs';

    const templatePath = path.join(__dirname, 'views', tpl);

    const model = {
      travelerName: doc.travelerName,
      agentName: doc.agentName,
      createdAt: new Date(doc.createdAt).toISOString().split('T')[0],
      idNumber: doc.idNumber,
      phone: doc.phone,
      address: doc.address,
      salesName: doc.salesName,
      signatureImgTag: doc.signatureDataUrl
        ? `<img src="${doc.signatureDataUrl}" style="max-width:300px">`
        : '',
      ...(doc.payload || {}),
    };

    const html = await ejs.renderFile(templatePath, model, { async: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

// Consent checkbox submit
app.post('/sign/:token/consent', async (req, res) => {
  try {
    const token = req.params.token;
    const fields = req.body; // consentCheck, customCheck, customField...
    const updated = await recordConsentByToken(token, fields);
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Complete signature with data URL
app.post('/sign/:token/complete', async (req, res) => {
  try {
    const token = req.params.token;
    const { signatureDataUrl } = req.body;
    if (!signatureDataUrl)
      return res.status(400).json({ ok: false, error: 'missing signature' });

    const updated = await completeByToken(token, signatureDataUrl);
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// 匯出 v2 HTTP Function（含 secrets/timeout/memory 等選項）
exports.web = onRequest(
  {
    // v2 可在此宣告要使用的 Secret Manager 祕密名稱
    secrets: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
    timeoutSeconds: 540,
    memory: '2GiB', // 注意是 GiB
  },
  (req, res) => app(req, res)
);
