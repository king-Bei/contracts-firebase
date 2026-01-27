const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const signer = require('node-signpdf').default;
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const fs = require('fs');
const path = require('path');

const CERT_PATH = path.join(__dirname, '../../certs/certificate.p12');
const CERT_PASSWORD = process.env.CERT_PASSWORD || 'secret'; // Default or from env

let browserInstance = null;

/**
 * Get or create a Puppeteer browser instance
 */
async function getBrowser() {
    if (browserInstance) return browserInstance;

    console.log('DEBUG: Launching Puppeteer...');
    const puppeteer = require('puppeteer');
    browserInstance = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Memory optimization for Docker/Linux
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ],
        headless: 'new'
    });

    // Cleanup on process exit
    process.on('exit', () => browserInstance?.close());
    return browserInstance;
}

/**
 * Generate PDF from HTML content
 * @param {string} htmlContent - The HTML string
 * @returns {Promise<Buffer>} - PDF Buffer
 */
async function generatePdfFromHtml(htmlContent) {
    console.log('DEBUG: [PDF] Attempting to get browser...');
    const browser = await getBrowser();
    console.log('DEBUG: [PDF] Opening new page...');
    const page = await browser.newPage();

    // Set content and wait for network idle to ensure images load
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: serif; 
                white-space: pre-wrap; 
                line-height: 1.6; 
                color: #333;
                margin: 0;
                padding: 40px;
            }
            img { max-width: 100%; height: auto; }
            strong { font-weight: bold; }
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    await page.close(); // Close page, not browser
    return Buffer.from(pdfBuffer);
}

/**
 * Add Signature Image and Flatten
 * @param {Buffer} pdfBuffer 
 * @param {string} signatureBase64 - Data URL or base64 string
 * @returns {Promise<Buffer>}
 */
async function addSignatureAndFlatten(pdfDoc, signatureBase64) {
    const isBuffer = Buffer.isBuffer(pdfDoc);
    const doc = isBuffer ? await PDFDocument.load(pdfDoc) : pdfDoc;

    const pages = doc.getPages();
    if (pages.length === 0) {
        throw new Error('PDF has no pages');
    }
    const lastPage = pages[pages.length - 1];

    // Embed PNG/JPG
    let signatureImage;
    if (signatureBase64.startsWith('data:image/png')) {
        signatureImage = await doc.embedPng(signatureBase64);
    } else if (signatureBase64.startsWith('data:image/jpeg') || signatureBase64.startsWith('data:image/jpg')) {
        signatureImage = await doc.embedJpg(signatureBase64);
    } else {
        try {
            signatureImage = await doc.embedPng(signatureBase64);
        } catch (e) {
            signatureImage = await doc.embedJpg(signatureBase64);
        }
    }

    const TARGET_WIDTH = 120;
    const imgProps = signatureImage.scale(1.0);
    const scale = TARGET_WIDTH / imgProps.width;
    const width = imgProps.width * scale;
    const height = imgProps.height * scale;

    const { width: pageWidth } = lastPage.getSize();

    lastPage.drawImage(signatureImage, {
        x: pageWidth - width - 60,
        y: 80,
        width,
        height,
    });

    if (isBuffer) {
        const pdfBytes = await doc.save();
        return Buffer.from(pdfBytes);
    }
    return doc;
}

/**
 * Add Audit Page
 * @param {Buffer} pdfBuffer 
 * @param {object} auditInfo - { ip, timestamp, uuid, signerName }
 * @returns {Promise<Buffer>}
 */
async function addAuditPage(pdfDoc, auditInfo) {
    const isBuffer = Buffer.isBuffer(pdfDoc);
    const doc = isBuffer ? await PDFDocument.load(pdfDoc) : pdfDoc;

    const page = doc.addPage();
    const { height } = page.getSize();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;

    const drawText = (text, y) => {
        page.drawText(text, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    };

    let y = height - 50;
    page.drawText('Audit Log / Certificate of Completion', { x: 50, y, size: 18, font, color: rgb(0, 0, 0) });
    y -= 40;

    drawText(`Document UUID: ${auditInfo.uuid}`, y);
    y -= 20;
    drawText(`Signed By: ${auditInfo.signerName}`, y);
    y -= 20;
    drawText(`Sign Timestamp: ${auditInfo.timestamp}`, y);
    y -= 20;
    drawText(`IP Address: ${auditInfo.ip}`, y);
    y -= 20;
    drawText(`Verification Code: ${auditInfo.verificationCode || 'N/A'}`, y);

    page.drawText('Generated by Jollify System', { x: 50, y: 30, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

    if (isBuffer) {
        const pdfBytes = await doc.save();
        return Buffer.from(pdfBytes);
    }
    return doc;
}

/**
 * Digitally Sign PDF (Lock)
 * @param {Buffer} pdfBuffer 
 * @returns {Promise<Buffer>}
 */
async function digitallySignPdf(pdfBuffer) {
    if (!fs.existsSync(CERT_PATH)) {
        console.warn('⚠️ No certificate found at ' + CERT_PATH + '. Skipping digital signature.');
        return pdfBuffer;
    }

    const p12Buffer = fs.readFileSync(CERT_PATH);

    // 1. Add Placeholder
    // Note: plainAddPlaceholder might return a Buffer or require specific handling
    // It appends a signature placeholder.
    const pdfWithPlaceholder = plainAddPlaceholder({
        pdfBuffer,
        reason: 'Contract Signed',
        location: 'Taipei, Taiwan',
        name: 'Jollify System',
        contactInfo: 'admin@jollify.com.tw',
    });

    // 2. Sign
    const signedPdf = signer.sign(pdfWithPlaceholder, p12Buffer, { passphrase: CERT_PASSWORD });

    return signedPdf;
}

// Additional helpers for Controller integration
const { renderTemplateWithVariables } = require('../utils/templateUtils');
const fileModel = require('../models/fileModel');

/**
 * Generate full contract PDF (Generate -> Sign -> Audit -> Lock)
 * @param {object} contract 
 * @param {string} signatureBase64 
 * @param {object} auditInfo 
 * @returns {Promise<Buffer>}
 */
async function generateContractPdfBuffer(contract, signatureBase64, auditInfo) {
    console.log('DEBUG: Rendering HTML for PDF...');
    let variables = contract.template_variables;
    if (typeof variables === 'string') {
        try {
            variables = JSON.parse(variables);
        } catch (e) {
            console.error('Failed to parse template_variables in PDF service:', e);
            variables = [];
        }
    }
    const html = renderTemplateWithVariables(contract.template_content, contract.variable_values, variables, {
        wrapBold: true,
    });
    console.log('DEBUG: HTML Rendered. Length:', html.length);

    console.log('DEBUG: Generating initial PDF from HTML...');
    const htmlPdfBuffer = await generatePdfFromHtml(html);

    // Load into pdf-lib to start multi-step manipulation
    let pdfDoc = await PDFDocument.load(htmlPdfBuffer);

    // Merge with Base PDF if exists
    if (contract.template_base_pdf_id) {
        console.log('DEBUG: Base PDF detected. Merging...');
        try {
            const basePdfFile = await fileModel.getFile(contract.template_base_pdf_id);
            if (basePdfFile && basePdfFile.data) {
                const basePdfDoc = await PDFDocument.load(basePdfFile.data);
                const htmlPages = await basePdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
                htmlPages.forEach(p => basePdfDoc.addPage(p));
                pdfDoc = basePdfDoc; // Switch context to the merged doc
                console.log('DEBUG: Merged PDF success.');
            }
        } catch (mergeError) {
            console.error('Failed to merge with base PDF:', mergeError);
        }
    }

    if (signatureBase64) {
        console.log('DEBUG: Adding signature to PDF...');
        pdfDoc = await addSignatureAndFlatten(pdfDoc, signatureBase64);
    }

    if (auditInfo) {
        console.log('DEBUG: Adding audit page...');
        pdfDoc = await addAuditPage(pdfDoc, auditInfo);
    }

    // Final save after all modifications
    console.log('DEBUG: [PDF] Saving final PDF Document...');
    const finalBuffer = Buffer.from(await pdfDoc.save());

    // Digital Signature (requires buffer)
    console.log('DEBUG: [PDF] Entering digital signing step...');
    return await digitallySignPdf(finalBuffer);
}

/**
 * Stream PDF to response
 * @param {object} res 
 * @param {object} contract 
 */
async function streamContractPdf(res, contract) {
    if (contract.signature_file_id) {
        const file = await fileModel.getFile(contract.signature_file_id);
        if (file) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="contract-${contract.contract_number || contract.id}.pdf"`);
            return res.send(file.data); // Assuming data is Buffer (BYTEA)
        }
    }
    // Fallback: Generate if not stored (Legacy or error)
    // Note: Use stored signature image if available
    const auditInfo = {
        uuid: contract.signing_link_token || String(contract.id),
        timestamp: new Date().toISOString(),
        ip: 'N/A',
        signerName: contract.client_name,
        verificationCode: contract.verification_code_plaintext
    };
    const pdf = await generateContractPdfBuffer(contract, contract.signature_image, auditInfo);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract-${contract.contract_number || contract.id}.pdf"`);
    res.send(pdf);
}

module.exports = {
    generatePdfFromHtml,
    addSignatureAndFlatten,
    addAuditPage,
    digitallySignPdf,
    generateContractPdfBuffer,
    streamContractPdf
};
