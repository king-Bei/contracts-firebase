const { PDFDocument, StandardFonts } = require('pdf-lib');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
const { renderTemplateToHtml, buildModel } = require('./templateRenderer');

async function simpleContractPdf(contract) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y, size=12) => page.drawText(String(text||''), { x, y, size, font });

  let y = 800;
  draw('合約（示範 PDF）', 50, y, 18); y -= 30;
  draw(`合約ID: ${contract.id}`, 50, y); y -= 20;
  draw(`旅客：${contract.travelerName||''}`, 50, y); y -= 20;
  draw(`旅行社：${contract.agentName||''}`, 50, y); y -= 20;
  draw(`狀態：${contract.status}`, 50, y); y -= 20;
  if (contract.signedAt) { draw(`簽署時間：${new Date(contract.signedAt).toISOString()}`, 50, y); y -= 20; }

  return await pdfDoc.save();
}

async function renderContractHtml(contract, templateBody) {
  const model = buildModel(contract);
  return renderTemplateToHtml(templateBody || '', model);
}

async function htmlToPdf(html, opts={}) {
  if (!chromium) throw new Error('Playwright not available on this runtime');
  const browser = await chromium.launch({
    args: ['--no-sandbox','--disable-setuid-sandbox'],
    headless: true
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });

  const headerTemplate = opts.headerTemplate || `<div style="font-size:10px; width:100%; padding:0 12mm;">
    <span>合約文件</span>
    <span style="float:right">第 <span class="pageNumber"></span> / <span class="totalPages"></span> 頁</span>
  </div>`;
  const footerTemplate = opts.footerTemplate || `<div style="font-size:10px; width:100%; padding:0 12mm;">
    <span>${new Date().toISOString()}</span>
    <span style="float:right">© 合約系統</span>
  </div>`;

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    margin: { top: '60px', bottom: '60px', left: '12mm', right: '12mm' }
  });
  await page.close();
  await browser.close();
  return pdf;
}

module.exports = { simpleContractPdf, renderContractHtml, htmlToPdf };
