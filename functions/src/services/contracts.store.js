const { db } = require('../admin');
const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 22);
const COL = 'contracts';

function toTypeCode(x) {
  if (!x) return 'group';
  const m = String(x).toLowerCase();
  if (m.includes('ind')) return 'individual';
  if (m.includes('flight') || m.includes('air')) return 'flight';
  return 'group';
}

async function createDraft(data, ownerUid) {
  const id = nanoid();
  const now = Date.now();

  const doc = {
    id,
    type: toTypeCode(data.type),
    travelerName: data.travelerName || '',
    agentName: data.agentName || '',
    createdAt: now,
    idNumber: data.idNumber || '',
    phone: data.phone || '',
    address: data.address || '',
    salesName: data.salesName || '',
    status: 'draft',
    payload: data.payload || {},
    templateId: data.templateId || null,
    customerEmail: data.customerEmail || null,
    ownerUid: ownerUid || null
  };

  await db.collection(COL).doc(id).set(doc);
  return doc;
}

async function updateDraft(id, patch) {
  const ref = db.collection(COL).doc(id);
  await ref.set({ ...patch, updatedAt: Date.now() }, { merge: true });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function sendForSign(id) {
  const ref = db.collection(COL).doc(id);
  await ref.set({
    status: 'pending',
    sentAt: Date.now()
  }, { merge: true });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

async function getById(id) {
  const doc = await db.collection(COL).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function listContracts(months = 3, ownerUid = null) {
  const ms = Number(months) || 3;
  const since = Date.now() - ms * 30 * 24 * 3600 * 1000;
  let q = db.collection(COL).where('createdAt', '>=', since).orderBy('createdAt', 'desc');
  if (ownerUid) q = q.where('ownerUid', '==', ownerUid);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function recordConsentById(id, consentFields) {
  await db.collection(COL).doc(id).set({ consent: consentFields }, { merge: true });
  return getById(id);
}

async function completeById(id, signatureDataUrl) {
  await db.collection(COL).doc(id).set({
    status: 'signed',
    signedAt: Date.now(),
    signatureDataUrl
  }, { merge: true });
  return getById(id);
}

module.exports = {
  createDraft,
  updateDraft,
  sendForSign,
  getById,
  listContracts,
  recordConsentById,
  completeById
};
