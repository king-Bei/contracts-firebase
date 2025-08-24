const { db } = require('../admin');
const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 22);
const COL = 'templates';

async function createTemplate(data, ownerUid) {
  const id = nanoid();
  const now = Date.now();
  const doc = {
    id,
    name: data.name || `untitled-${id.slice(-6)}`,
    body: data.body || '',
    fields: Array.isArray(data.fields) ? data.fields : [],
    createdAt: now,
    updatedAt: now,
    ownerUid: ownerUid || null
  };
  await db.collection(COL).doc(id).set(doc);
  return doc;
}

async function updateTemplate(id, patch) {
  const ref = db.collection(COL).doc(id);
  await ref.set({ ...patch, updatedAt: Date.now() }, { merge: true });
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
