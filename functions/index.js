
exports.api = require('./api').api;
exports.web = require('./web').web;

exports.api = functions
  .runWith({ memory: '1GB', timeoutSeconds: 120 })
  .https.onRequest(apiApp);

exports.web = functions
  .runWith({ memory: '1GB', timeoutSeconds: 120 })
  .https.onRequest(webApp);

const functions = require('firebase-functions');
const { db, storage } = require('./src/admin');
const { renderContractHtml, htmlToPdf, simpleContractPdf } = require('./src/services/pdfService');

exports.generatePdf = functions
  .runWith({ memory: '1GiB', timeoutSeconds: 120, secrets: ['GOOGLE_SERVICE_ACCOUNT_JSON'] })
  .firestore
  .document('contracts/{id}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;
    if (after.status !== 'signed' || after.pdfStoragePath) return;

    const contractId = context.params.id;

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
      console.error('Playwright 轉檔失敗，改用簡易 PDF：', e.message);
      pdfBytes = await simpleContractPdf({ id: contractId, ...after });
    }

    // 4) 上傳至 Storage
    const bucket = storage.bucket();
    const path = `pdf/contracts/${contractId}.pdf`;
    const file = bucket.file(path);
    await file.save(Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      resumable: false
    });

    await db.collection('contracts').doc(contractId).set({ pdfStoragePath: path }, { merge: true });
    console.log(`PDF stored at gs://${bucket.name}/${path}`);
  });
