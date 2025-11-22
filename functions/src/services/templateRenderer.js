const ejs = require('ejs');

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractVariables(body = '') {
  const found = new Set();
  let match;
  while ((match = PLACEHOLDER.exec(body)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found.values());
}

function lookup(model, keyPath) {
  return keyPath.split('.').reduce((acc, cur) => (acc ? acc[cur] : undefined), model);
}

function normalizeTemplate(body = '') {
  return body.replace(PLACEHOLDER, (_match, key) => `<%- __highlightVar(__lookup("${key}")) %>`);
}

function buildModel(contract = {}) {
  const model = {
    travelerName: contract.travelerName,
    agentName: contract.agentName,
    createdAt: contract.createdAt ? new Date(contract.createdAt).toISOString().split('T')[0] : '',
    idNumber: contract.idNumber,
    phone: contract.phone,
    address: contract.address,
    salesName: contract.salesName,
    signatureImgTag: contract.signatureDataUrl
      ? `<img src="${contract.signatureDataUrl}" style="max-width:300px">`
      : '',
    payload: contract.payload || {},
    ...(contract.payload || {}),
  };
  return model;
}

async function renderTemplateToHtml(body, contract = {}, opts = {}) {
  const normalized = normalizeTemplate(body || '');
  const model = buildModel(contract);
  const htmlBody = await ejs.render(normalized, {
    ...model,
    __lookup: (key) => lookup(model, key),
    __highlightVar: (value) => `<span class="var-value">${escapeHtml(value)}</span>`,
  }, { async: true });

  const baseStyle = opts.baseStyle !== undefined ? opts.baseStyle : `
    @page { size: A4; margin: 20mm 12mm 20mm 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", Arial, "PingFang TC", "Heiti TC", sans-serif; font-size: 12pt; color: #111; }
    h1,h2,h3 { margin: 0 0 8px 0; }
    .page-break { page-break-before: always; }
    .var-value { font-weight: 700; color: #0b3d91; }
  `;

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${baseStyle}</style></head><body>${htmlBody}</body></html>`;
}

module.exports = {
  extractVariables,
  renderTemplateToHtml,
  buildModel,
};
