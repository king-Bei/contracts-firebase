const { google } = require('googleapis');

async function getDriveClient() {
  // Uses ADC via GOOGLE_APPLICATION_CREDENTIALS or default credentials on Functions
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

async function uploadPDF(buffer, filename, folderId) {
  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: 'application/pdf',
      parents: folderId ? [folderId] : undefined
    },
    media: {
      mimeType: 'application/pdf',
      body: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    },
    fields: 'id, webViewLink, webContentLink'
  });
  const fileId = res.data.id;
  return {
    id: fileId,
    webViewLink: res.data.webViewLink,
    webContentLink: res.data.webContentLink
  };
}

module.exports = { uploadPDF };
