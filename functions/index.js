// index.js － Firebase Functions v2 版（CommonJS）

// --- v2 imports ---
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');

// --- 你原本的模組 ---
const apiApp = require('./api').api;   // 假設 ./api 匯出的是一個 express app 或 handler
const webApp = require('./web').web;   // 假設 ./web 匯出的是一個 express app 或 handler

const { db, storage } = require('./src/admin');
const { renderContractHtml, htmlToPdf, simpleContractPdf } = require('./src/services/pdfService');

// =========================
// HTTP Functions (v2)
// =========================

// 若 ./api 與 ./web 是 express app：直接包成 v2 的 onRequest
// 可依需要調整 region / cors 等。這裡示範 asia-east1 與 cors: true。
exports.api = onRequest(
  { region: 'asia-east1', cors: true },
  apiApp
);

exports.web = onRequest(
  { region: 'asia-east1', cors: true },
  webApp
);

// =========================
// Firestore Trigger (v2)
// =========================

// 將原本的 onWrite(...) 改為 v2 的 onDocumentWritten。
// 設定 memory / timeoutSeconds / secrets 都放在 options 物件中。
exports.generatePdf = onDocumentWritten(
  {
    region: 'asia-east1',
    document: 'contracts/{id}',
    memory: '1GiB',
    timeoutSeconds: 120,
    secrets: ['GOOGLE_SERVICE_ACCOUNT_JSON'],
  },
  async (event) => {
    // v2 事件物件：event.data.before / event.data.after 為 QueryDocumentSnapshot | nullish
    const afterSnap = event.data?.after;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

    // 若文件被刪除或沒有 after，直接返回
    if (!after) return;

    // 僅在 status === 'signed' 且尚未有 pdfStoragePath 時才進行
    if (after.status !== 'signed' || after.pdfStoragePath) return;

    const contractId = event.params.id;

    // 1) 讀取關聯模板
    const tsnap = await db.collection('templates').doc(after.templateId).get();
    const tpl = tsnap.exists ? tsnap.data() : { body: '<h1>合約</h1>' };

    // 2) EJS 渲染 HTML
    const html = await renderContractHtml({ id: contractId, ...after }, tpl.body || '');

    // 3) 轉 PDF（Playwright）；若 Playwright 不可用則退回簡易 PDF
    let pdfBytes;
    try {
      pdfBytes = await htmlToPdf(html, {});
    } catch (e) {
      logger.error('Playwright 轉檔失敗，改用簡易 PDF：', e);
      pdfBytes = await simpleContractPdf({ id: contractId, ...after });
    }

    // 4) 上傳至 Storage
    const bucket = storage.bucket();
    const path = `pdf/contracts/${contractId}.pdf`;
    const file = bucket.file(path);

    await file.save(Buffer.from(pdfBytes), {
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          // 若你需要用 token 產生可下載連結（舊版 getDownloadURL workaround）
          firebaseStorageDownloadTokens: after.signToken,
        },
      },
    });

    // 5) 回寫 PDF 路徑
    await db.collection('contracts').doc(contractId).set(
      { pdfStoragePath: path },
      { merge: true }
    );

    logger.info(`PDF stored at gs://${bucket.name}/${path}`);
  }
);
