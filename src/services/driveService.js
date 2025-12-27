const { google } = require('googleapis');
const { Readable } = require('stream');

const normalizePrivateKey = (key) => {
    if (!key) return key;
    let normalized = key.trim();
    // strip surrounding quotes if accidentally included
    if (normalized.startsWith('"') && normalized.endsWith('"')) {
        normalized = normalized.slice(1, -1);
    }
    if (normalized.startsWith("'") && normalized.endsWith("'")) {
        normalized = normalized.slice(1, -1);
    }
    // handle escaped and Windows line endings
    normalized = normalized.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    return normalized;
};

let driveClient = null;

const getDriveClient = () => {
    if (driveClient) return driveClient;
    if (process.env.ENABLE_DRIVE_BACKUP !== 'true') {
        return null;
    }
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

    if (!clientEmail || !privateKey || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
        console.warn('Google Drive 未設定，跳過自動上傳簽署 PDF。');
        return null;
    }

    const auth = new google.auth.JWT(
        clientEmail,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/drive.file']
    );
    driveClient = google.drive({ version: 'v3', auth });
    return driveClient;
};

const formatSignedFilename = (contract) => {
    const signedDate = contract.signed_at ? new Date(contract.signed_at) : new Date();
    const yyyy = signedDate.getFullYear();
    const mm = String(signedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(signedDate.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${contract.id}.pdf`;
};

const uploadSignedPdfToDrive = async (contract, pdfBuffer) => {
    if (process.env.ENABLE_DRIVE_BACKUP !== 'true') return null;
    const drive = getDriveClient();
    if (!drive) return null;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const filename = formatSignedFilename(contract);

    try {
        const fileMetadata = {
            name: filename,
            parents: [folderId],
        };

        const media = {
            mimeType: 'application/pdf',
            body: Readable.from(pdfBuffer),
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media,
            fields: 'id, webViewLink, webContentLink',
        });
        return response.data;
    } catch (error) {
        console.error('上傳簽署 PDF 至 Google Drive 失敗:', error.message);
        return null;
    }
};

module.exports = {
    uploadSignedPdfToDrive,
};
