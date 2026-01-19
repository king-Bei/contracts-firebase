require('dotenv').config();
const { generatePdfFromHtml, addAuditPage, digitallySignPdf } = require('./src/services/pdfService');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Testing PDF Generation...');
    try {
        // 1. Generate
        const html = '<h1>Test Contract</h1><p>This is a test.</p>';
        let pdf = await generatePdfFromHtml(html);
        console.log('PDF Generated. Size:', pdf.length);

        // 2. Audit
        pdf = await addAuditPage(pdf, {
            ip: '127.0.0.1',
            timestamp: new Date().toISOString(),
            uuid: 'test-uuid',
            signerName: 'Test User',
            verificationCode: '123456'
        });
        console.log('Audit Page Added. Size:', pdf.length);

        // 3. Sign
        // Create dummy cert if not exists
        const certPath = path.join(__dirname, 'certs/certificate.p12');
        if (!fs.existsSync(certPath)) {
            console.warn('Skipping Sign test (no cert). Please add certs/certificate.p12 to test signing.');
        } else {
            pdf = await digitallySignPdf(pdf);
            console.log('PDF Signed. Size:', pdf.length);
        }

        fs.writeFileSync('test_output.pdf', pdf);
        console.log('Saved to test_output.pdf');
    } catch (e) {
        console.error('Test Failed:', e);
    }
}

test();
