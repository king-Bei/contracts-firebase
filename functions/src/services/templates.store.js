const { db } = require('../admin');
const { customAlphabet } = require('nanoid');
const { extractVariables } = require('./templateRenderer');

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 22);
const COL = 'templates';

async function createTemplate(data, ownerUid) {
  const id = nanoid();
  const now = Date.now();
  const fieldsFromBody = extractVariables(data.body || '').map((key) => ({ key, label: key }));
  const doc = {
    id,
    name: data.name || `untitled-${id.slice(-6)}`,
    body: data.body || '',
    fields: Array.isArray(data.fields) && data.fields.length ? data.fields : fieldsFromBody,
    createdAt: now,
    updatedAt: now,
    ownerUid: ownerUid || null
  };
  await db.collection(COL).doc(id).set(doc);
  return doc;
}

async function updateTemplate(id, patch) {
  const ref = db.collection(COL).doc(id);
  const body = typeof patch.body === 'string' ? patch.body : null;
  const fieldsFromBody = body ? extractVariables(body).map((key) => ({ key, label: key })) : null;
  const next = { ...patch };
  if ((!patch.fields || !patch.fields.length) && fieldsFromBody) {
    next.fields = fieldsFromBody;
  }
  await ref.set({ ...next, updatedAt: Date.now() }, { merge: true });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function getTemplate(id) {
  const snap = await db.collection(COL).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function listTemplates(ownerUid) {
  let q = db.collection(COL).orderBy('createdAt', 'desc').limit(100);
  if (ownerUid) q = q.where('ownerUid', '==', ownerUid);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = { createTemplate, updateTemplate, getTemplate, listTemplates };
