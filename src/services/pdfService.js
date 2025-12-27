const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');
const fileModel = require('../models/fileModel');
const { renderTemplateWithVariables } = require('../utils/templateUtils');

const NOTO_SANS_TC_URL = 'https://fonts.gstatic.com/ea/notosanstc/v1/NotoSansTC-Regular.otf';
const LOCAL_TCFONT_PATH = path.join(__dirname, '..', '..', 'fonts', 'NotoSansTC-Regular.otf');
let cachedTcFont = null;

const fetchFontBuffer = (url) => {
    return new Promise(resolve => {
        if (!url) return resolve(null);
        try {
            https.get(url, res => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                const data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => resolve(Buffer.concat(data)));
            }).on('error', () => resolve(null));
        } catch (err) {
            resolve(null);
        }
    });
};

const getTraditionalChineseFont = async () => {
    if (cachedTcFont) return cachedTcFont;
    try {
        if (fs.existsSync(LOCAL_TCFONT_PATH)) {
            cachedTcFont = fs.readFileSync(LOCAL_TCFONT_PATH);
            return cachedTcFont;
        }
    } catch (err) {
        // ignore and fallback to remote
    }
    cachedTcFont = await fetchFontBuffer(NOTO_SANS_TC_URL);
    return cachedTcFont;
};

const fetchImageBuffer = (url) => {
    return new Promise(resolve => {
        if (!url) return resolve(null);

        // data URL
        if (url.startsWith('data:image')) {
            const base64 = url.split(',')[1];
            try {
                return resolve(Buffer.from(base64, 'base64'));
            } catch (err) {
                return resolve(null);
            }
        }

        try {
            https.get(url, res => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return resolve(null);
                }
                const data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => resolve(Buffer.concat(data)));
            }).on('error', () => resolve(null));
        } catch (err) {
            resolve(null);
        }
    });
};

const htmlToPlain = (html) => {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const parseStyleMap = (styleString = '') => {
    const styles = {};
    styleString.split(';').forEach(pair => {
        const [rawKey, rawVal] = pair.split(':');
        if (!rawKey || !rawVal) return;
        styles[rawKey.trim().toLowerCase()] = rawVal.trim();
    });
    return styles;
};

const dataUrlToBuffer = (dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;
    return Buffer.from(match[2], 'base64');
};

const extractContentPartsWithImages = (html) => {
    const parts = [];
    if (!html) return parts;

    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let lastIndex = 0;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
        const before = html.slice(lastIndex, match.index);
        const textContent = htmlToPlain(before);
        if (textContent) {
            parts.push({ type: 'text', content: textContent });
        }
        const src = match[1];
        const fullTag = match[0] || '';
        const styleMatch = fullTag.match(/style=["']([^"']*)["']/i);
        const widthMatch = fullTag.match(/\bwidth=["']([^"']+)["']/i);
        const heightMatch = fullTag.match(/\bheight=["']([^"']+)["']/i);
        const styles = parseStyleMap(styleMatch ? styleMatch[1] : '');
        if (widthMatch && !styles.width) styles.width = widthMatch[1];
        if (heightMatch && !styles.height) styles.height = heightMatch[1];

        if (src) {
            parts.push({ type: 'image', src, styles });
        }
        lastIndex = imgRegex.lastIndex;
    }

    const remaining = html.slice(lastIndex);
    const remainingText = htmlToPlain(remaining);
    if (remainingText) {
        parts.push({ type: 'text', content: remainingText });
    }

    return parts;
};

const computeImageOptions = (styles = {}, pageWidth = 400, pageHeight = 400) => {
    const parseLength = (value, base) => {
        if (!value) return null;
        const trimmed = value.trim();
        const percentMatch = trimmed.match(/^([0-9.]+)%$/);
        if (percentMatch) {
            return base * (parseFloat(percentMatch[1]) / 100);
        }
        const pxMatch = trimmed.match(/^([0-9.]+)px$/);
        if (pxMatch) {
            return parseFloat(pxMatch[1]);
        }
        const numMatch = trimmed.match(/^([0-9.]+)$/);
        if (numMatch) {
            return parseFloat(numMatch[1]);
        }
        return null;
    };

    const widthVal = parseLength(styles.width, pageWidth);
    const heightVal = parseLength(styles.height, pageHeight);
    const maxWidthVal = parseLength(styles['max-width'], pageWidth);
    const maxHeightVal = parseLength(styles['max-height'], pageHeight);

    let targetWidth = widthVal || maxWidthVal || pageWidth;
    let targetHeight = heightVal || maxHeightVal || null;

    if (maxWidthVal && targetWidth > maxWidthVal) {
        targetWidth = maxWidthVal;
    }
    if (maxHeightVal && targetHeight && targetHeight > maxHeightVal) {
        targetHeight = maxHeightVal;
    }

    const options = { align: 'left' };
    if (targetWidth && targetHeight) {
        options.fit = [targetWidth, targetHeight];
    } else if (targetWidth) {
        options.width = targetWidth;
    } else if (targetHeight) {
        options.height = targetHeight;
    } else {
        options.fit = [pageWidth, pageHeight / 2];
    }
    return options;
};

const SIGN_PLACEHOLDER = '簽署欄位';

const applyContractPdfContent = async (doc, contract) => {
    const tcFont = await getTraditionalChineseFont();
    if (tcFont) {
        doc.registerFont('NotoTC', tcFont);
        doc.font('NotoTC');
    }

    // 標頭資訊
    if (contract.template_logo_url) {
        const logoBuffer = await fetchImageBuffer(contract.template_logo_url);
        if (logoBuffer) {
            doc.image(logoBuffer, { fit: [220, 120], align: 'center' });
            doc.moveDown();
        }
    }

    doc.fontSize(16).text(contract.template_name || '合約', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`客戶：${contract.client_name || '-'}`);
    doc.text(`狀態：${contract.status}`);
    if (contract.signed_at) {
        doc.text(`簽署時間：${new Date(contract.signed_at).toLocaleString()}`);
    }
    doc.moveDown();

    // 內容
    const filledContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
        wrapBold: false,
        signatureImage: null, // Don't embed signature in HTML, handle manually below
        signaturePlaceholder: SIGN_PLACEHOLDER,
    });
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const parts = filledContent.split(SIGN_PLACEHOLDER);
    // Re-architecture: Support signature_file_id
    let sigBuffer = null;
    const hasSignature = Boolean(contract.signature_image || contract.signature_file_id);

    if (contract.signature_file_id) {
        try {
            const fileRecord = await fileModel.getFile(contract.signature_file_id);
            if (fileRecord && fileRecord.data) {
                sigBuffer = fileRecord.data;
            }
        } catch (err) {
            console.error('Failed to fetch signature file from DB:', err);
        }
    }

    if (!sigBuffer && contract.signature_image) {
        sigBuffer = await fetchImageBuffer(contract.signature_image);
    }

    doc.fontSize(12);
    for (let i = 0; i < parts.length; i++) {
        const contentBlocks = extractContentPartsWithImages(parts[i]);
        for (const block of contentBlocks) {
            if (block.type === 'text') {
                doc.text(block.content);
                doc.moveDown(0.5);
            } else if (block.type === 'image') {
                const imgBuffer = block.src.startsWith('data:')
                    ? dataUrlToBuffer(block.src)
                    : await fetchImageBuffer(block.src);
                if (imgBuffer) {
                    const imgOptions = computeImageOptions(block.styles, pageWidth, pageHeight);
                    doc.image(imgBuffer, imgOptions);
                } else {
                    doc.text('[圖片無法取得]');
                }
                doc.moveDown(0.5);
            }
        }

        const needsSignature = hasSignature && i < parts.length - 1;
        if (needsSignature) {
            doc.moveDown(0.5);
            if (sigBuffer) {
                doc.image(sigBuffer, { fit: [pageWidth * 0.6, 200], align: 'left' });
            } else {
                doc.text('[簽名圖片無法取得]');
            }
            doc.moveDown(0.5);
        }
    }
};

const getContractEncryptionOptions = (contract) => {
    // 預設密碼為簽署連結 Token 的後 6 碼，若無則使用 ID
    let passwordSource = contract.signing_token || contract.id || '000000';
    let password = String(passwordSource).slice(-6);

    return {
        userPassword: password,
        ownerPassword: password,
        permissions: {
            printing: 'highResolution',
            modifying: false,
            copying: false,
        }
    };
};

const streamContractPdf = async (res, contract) => {
    const options = {
        margin: 50,
        ...getContractEncryptionOptions(contract),
    };
    const doc = new PDFDocument(options);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract-${contract.id}.pdf"`);
    doc.pipe(res);
    await applyContractPdfContent(doc, contract);
    doc.end();
};

const generateContractPdfBuffer = (contract) => {
    return new Promise(async (resolve, reject) => {
        const options = {
            margin: 50,
            ...getContractEncryptionOptions(contract),
        };
        const doc = new PDFDocument(options);
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        try {
            await applyContractPdfContent(doc, contract);
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = {
    streamContractPdf,
    generateContractPdfBuffer,
    applyContractPdfContent,
};
