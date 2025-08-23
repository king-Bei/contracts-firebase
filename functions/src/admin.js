const admin = require('firebase-admin');

if (!admin.apps.length) {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const fs = require('fs');
    const path = require('path');
    const saPath = path.join(__dirname, '..', 'serviceAccount.local.json');
    fs.writeFileSync(saPath, process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
  }
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

module.exports = { admin, db, storage };
