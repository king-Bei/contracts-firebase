const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const signer = require('node-signpdf').default;
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const fs = require('fs');
const path = require('path');

const CERT_PATH = path.join(__dirname, '../../certs/certificate.p12');
const CERT_PASSWORD = process.env.CERT_PASSWORD || 'secret'; // Default or from env

/**
 * Generate PDF from HTML content
 * @param {string} htmlContent - The HTML string
 * @returns {Promise<Buffer>} - PDF Buffer
 */
async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for some environments
        headless: 'new'
    });
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

    await browser.close();
    return Buffer.from(pdfBuffer);
}

/**
 * Add Signature Image and Flatten
 * @param {Buffer} pdfBuffer 
 * @param {string} signatureBase64 - Data URL or base64 string
 * @returns {Promise<Buffer>}
 */
async function addSignatureAndFlatten(pdfBuffer, signatureBase64) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
        throw new Error('PDF has no pages');
    }
    const lastPage = pages[pages.length - 1]; // Assumption: Signature on last page

    // Embed PNG/JPG
    let signatureImage;
    if (signatureBase64.startsWith('data:image/png')) {
        signatureImage = await pdfDoc.embedPng(signatureBase64);
    } else if (signatureBase64.startsWith('data:image/jpeg') || signatureBase64.startsWith('data:image/jpg')) {
        signatureImage = await pdfDoc.embedJpg(signatureBase64);
    } else {
        // Try guessing or assume PNG if just base64
        try {
            signatureImage = await pdfDoc.embedPng(signatureBase64);
        } catch (e) {
            signatureImage = await pdfDoc.embedJpg(signatureBase64);
        }
    }

    // Use fixed width/height for signature to ensure consistency
    const TARGET_WIDTH = 120; // Default signature width
    const imgProps = signatureImage.scale(1.0);
    const scale = TARGET_WIDTH / imgProps.width;
    const width = imgProps.width * scale;
    const height = imgProps.height * scale;

    const { width: pageWidth, height: pageHeight } = lastPage.getSize();

    // Draw at bottom right (approximate position)
    lastPage.drawImage(signatureImage, {
        x: pageWidth - width - 60,
        y: 80, // Slightly higher for visibility
        width,
        height,
    });

    // Flatten: pdf-lib doesn't have a "flatten all" that rasterizes, 
    // but flattening form fields is done via form.flatten(). 
    // Since we start from HTML, there are no fields. 
    // The requirement "Flatten" likely means "Burn into PDF", which drawImage does.

    // Save
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

/**
 * Add Audit Page
 * @param {Buffer} pdfBuffer 
 * @param {object} auditInfo - { ip, timestamp, uuid, signerName }
 * @returns {Promise<Buffer>}
 */
async function addAuditPage(pdfBuffer, auditInfo) {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    if (pdfDoc.getPageCount() === 0) {
        // If empty, creating first page instead of adding one might be safer but addPage is fine
    }
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;

    const drawText = (text, y) => {
        page.drawText(text, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) });
    };

    let y = height - 50;

    // Header
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

    // Footer
    page.drawText('Generated by Jollify System', { x: 50, y: 30, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
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
        // no signatureImage here because we flatten it manually
    });
    console.log('DEBUG: HTML Rendered. Length:', html.length);

    console.log('DEBUG: Calling generatePdfFromHtml...');
    let pdf = await generatePdfFromHtml(html);
    console.log('DEBUG: PDF Base generated. Size:', pdf.length);

    // Merge with Base PDF if exists
    if (contract.template_base_pdf_id) {
        console.log('DEBUG: Base PDF detected. Merging...');
        try {
            const basePdfFile = await fileModel.getFile(contract.template_base_pdf_id);
            if (basePdfFile && basePdfFile.data) {
                const mainPdfDoc = await PDFDocument.load(basePdfFile.data);
                const htmlPdfDoc = await PDFDocument.load(pdf);

                // Copy pages from HTML PDF to Main PDF (Append mode)
                const htmlPages = await mainPdfDoc.copyPages(htmlPdfDoc, htmlPdfDoc.getPageIndices());
                htmlPages.forEach(page => mainPdfDoc.addPage(page));

                const mergedBytes = await mainPdfDoc.save();
                pdf = Buffer.from(mergedBytes);
                console.log('DEBUG: Merged PDF success. New Size:', pdf.length);
            }
        } catch (mergeError) {
            console.error('Failed to merge with base PDF:', mergeError);
            // Continue with only HTML PDF if merge fails
        }
    }

    if (signatureBase64) {
        console.log('DEBUG: Adding signature to PDF...');
        pdf = await addSignatureAndFlatten(pdf, signatureBase64);
    }
    if (auditInfo) {
        console.log('DEBUG: Adding audit page...');
        pdf = await addAuditPage(pdf, auditInfo);
    }
    pdf = await digitallySignPdf(pdf);
    return pdf;
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
