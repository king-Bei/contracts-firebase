const contractModel = require('../models/contractModel');
const fileModel = require('../models/fileModel');
const auditLogModel = require('../models/auditLogModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { renderTemplateWithVariables, normalizeVariableValues, renderTemplateForInteractivePreview } = require('../utils/templateUtils');
const { streamContractPdf } = require('../services/pdfService');
const { compressImage } = require('../utils/imageUtils');

// Helper
const markContractVerified = (req, token) => {
    if (!req.session.verifiedContracts) {
        req.session.verifiedContracts = {};
    }
    req.session.verifiedContracts[token] = true;
};

const isContractVerified = (req, token) => {
    return Boolean(req.session.verifiedContracts && req.session.verifiedContracts[token]);
};

const signContractPage = async (req, res) => {
    try {
        const contract = await contractModel.findByToken(req.params.token);
        if (!contract) {
            return res.status(404).send('簽署連結無效');
        }

        const isVerified = isContractVerified(req, req.params.token);
        const canSign = contract.status === 'PENDING_SIGNATURE';

        // For non-signable contracts, render the final content on the server.
        if (!canSign) {
            const finalContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
                wrapBold: true,
                signatureImage: contract.signature_image,
            });
            return res.render('sign-contract', {
                title: '合約檢視',
                signingToken: req.params.token,
                contract,
                previewContent: finalContent,
                isVerified,
                canSign,
                error: null,
                statusMessage: '此合約目前無法簽署。',
            });
        }

        // Face-to-Face Signing Logic
        if (req.query.mode === 'face-to-face' && req.session && req.session.user && (req.session.user.role === 'salesperson' || req.session.user.role === 'manager')) {
            markContractVerified(req, req.params.token);
            return res.redirect(`/contracts/sign/${req.params.token}`);
        }

        // For signable contracts, pass data to the view for rendering, including inputs.
        res.render('sign-contract', {
            title: '合約簽署',
            signingToken: req.params.token,
            contract,
            previewContent: renderTemplateForInteractivePreview(contract.template_content, contract.variable_values, contract.template_variables),
            isVerified,
            canSign,
            error: null,
            statusMessage: null,
        });
    } catch (error) {
        console.error('Failed to load signing page:', error);
        res.status(500).send('無法載入簽署頁面');
    }
};

const downloadSignedPdf = async (req, res) => {
    try {
        const contract = await contractModel.findByToken(req.params.token);
        if (!contract) {
            return res.status(404).send('簽署連結無效');
        }
        if (contract.status !== 'SIGNED' && contract.status !== 'PENDING_SIGNATURE') {
            return res.status(400).send('目前狀態無法預覽 PDF');
        }
        await streamContractPdf(res, contract);
    } catch (error) {
        console.error('Failed to download public contract pdf:', error);
        res.status(500).send('無法產生 PDF');
    }
};

const verifyContract = async (req, res) => {
    try {
        const contract = await contractModel.findByToken(req.params.token);
        if (!contract) {
            return res.status(404).send('簽署連結無效');
        }

        const canSign = contract.status === 'PENDING_SIGNATURE';

        // Check if verified
        if (isContractVerified(req, req.params.token)) {
            return res.redirect(`/contracts/sign/${req.params.token}`);
        }

        const { verification_code } = req.body;
        if (!contract.verification_code_hash) {
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: null,
                isVerified: false,
                canSign,
                error: '目前無法驗證此合約，請聯繫您的業務員。',
                statusMessage: canSign ? null : '此合約目前無法簽署。',
            });
        }

        const isCodeValid = await bcrypt.compare(verification_code || '', contract.verification_code_hash);

        if (!isCodeValid) {
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: null,
                isVerified: false,
                canSign,
                error: '驗證碼錯誤，請重新輸入。',
                statusMessage: canSign ? null : '此合約目前無法簽署。',
            });
        }

        markContractVerified(req, req.params.token);
        res.redirect(`/contracts/sign/${req.params.token}`);
    } catch (error) {
        console.error('Failed to verify code:', error);
        res.status(500).send('驗證失敗，請稍後再試。');
    }
};

const submitSignature = async (req, res) => {
    try {
        const contract = await contractModel.findByToken(req.params.token);
        if (!contract) {
            return res.status(404).send('簽署連結無效');
        }

        // 因為 multipart/form-data 特性，我們需要手動解析嵌套的欄位名稱
        const customerVariables = {};
        const bodyKeys = Object.keys(req.body);

        // 如果 req.body.customer_variables 已經被解析為物件 (某些 middleware 或設定造成)，直接合併
        if (req.body.customer_variables && typeof req.body.customer_variables === 'object') {
            Object.assign(customerVariables, req.body.customer_variables);
        }

        console.log('DEBUG: req.body keys:', bodyKeys); // DEBUG LOG
        console.log('DEBUG: req.body raw extracted:', req.body); // DEBUG LOG

        // 解析文字欄位 (e.g. "customer_variables[foo]") - 針對標準 multer/form-data 行為
        bodyKeys.forEach(key => {
            const match = key.match(/^customer_variables\[(.+)\]$/);
            if (match) {
                customerVariables[match[1]] = req.body[key];
            }
        });

        console.log('DEBUG: Extracted customerVariables:', customerVariables); // DEBUG LOG

        // 處理上傳的檔案 (圖片)
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const match = file.fieldname.match(/^customer_variables\[(.+)\]$/);
                if (match) {
                    const key = match[1];
                    try {
                        const compressedBuffer = await compressImage(file.buffer);
                        const base64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
                        customerVariables[key] = base64;
                    } catch (err) {
                        console.error(`Failed to compress image for key ${key}:`, err);
                        // Ignore error or handle?
                    }
                }
            }
        }

        const agree_terms = req.body.agree_terms;
        const signature_data = req.body.signature_data;

        const isVerified = isContractVerified(req, req.params.token);

        if (!isVerified) {
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: null,
                isVerified: false,
                canSign: contract.status === 'PENDING_SIGNATURE',
                error: '請先完成驗證碼驗證後再簽署。',
                statusMessage: null,
            });
        }

        if (contract.status !== 'PENDING_SIGNATURE') {
            const staticPreview = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
                wrapBold: true,
                signatureImage: contract.signature_image,
            });
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: staticPreview,
                isVerified,
                canSign: false,
                error: null,
                statusMessage: '此合約目前無法簽署。',
            });
        }

        // For interactive errors (still pending signature), use interactive preview
        const interactivePreview = renderTemplateForInteractivePreview(contract.template_content, contract.variable_values, contract.template_variables);

        if (!agree_terms) {
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: interactivePreview,
                isVerified,
                canSign: true,
                error: '請先同意個資保護條款。',
                statusMessage: null,
            });
        }

        if (!signature_data) {
            return res.render('sign-contract', {
                title: '合約簽署',
                signingToken: req.params.token,
                contract,
                previewContent: interactivePreview,
                isVerified,
                canSign: true,
                error: '請提供簽名。',
                statusMessage: null,
            });
        }

        let existingVariables = contract.variable_values || {};
        if (typeof existingVariables === 'string') {
            try {
                existingVariables = JSON.parse(existingVariables);
            } catch (e) {
                console.error('Failed to parse existing variable_values:', e);
                existingVariables = {};
            }
        }
        const finalVariables = { ...existingVariables, ...customerVariables };
        const normalizedFinalVariables = normalizeVariableValues(finalVariables, contract.template_variables);

        // Generate Full PDF Workflow
        const auditInfo = {
            ip: req.ip,
            timestamp: new Date().toISOString(),
            uuid: contract.signing_link_token,
            signerName: contract.client_name,
            verificationCode: contract.verification_code_plaintext
        };

        const { generateContractPdfBuffer } = require('../services/pdfService'); // Ensure import

        // Generate PDF
        console.log('DEBUG: Starting PDF generation...');
        let pdfBuffer;
        try {
            pdfBuffer = await generateContractPdfBuffer({
                ...contract,
                variable_values: normalizedFinalVariables
            }, signature_data, auditInfo);
        } catch (genError) {
            console.error('PDF Generation failed:', genError);
            throw new Error('PDF Generation Failed');
        }
        console.log('DEBUG: PDF generation success. Size:', pdfBuffer.length);

        // Save PDF to Storage
        console.log('DEBUG: Saving PDF to storage...');
        const signatureFileId = crypto.randomUUID();
        await fileModel.saveFile({
            id: signatureFileId,
            mime_type: 'application/pdf',
            data: pdfBuffer,
            size: pdfBuffer.length
        });
        console.log('DEBUG: PDF saved to storage. File ID:', signatureFileId);

        // Update Contract
        console.log('DEBUG: Updating contract status to SIGNED...');
        // We use markAsSigned but it expects signatureFileId (which IS the PDF now)
        // and signatureImage (legacy). We pass base64 signature for legacy image column just in case.
        const updated = await contractModel.markAsSigned(
            contract.id,
            signatureFileId,
            normalizedFinalVariables,
            signature_data // Legacy image storage
        );
        console.log('DEBUG: Contract updated successfully.');

        const signedContract = { ...contract, ...updated };

        // Security Audit Log
        auditLogModel.log({
            user_id: null,
            action: 'SIGN_CONTRACT',
            resource_id: String(contract.id),
            details: {
                clientName: contract.client_name,
                fileId: signatureFileId
            },
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Google Drive Backup
        try {
            const { uploadSignedPdfToDrive } = require('../services/driveService');
            // Check if drive service is actually enabled/configured inside the service
            // We pass the signed contract and the PDF buffer we just generated
            await uploadSignedPdfToDrive(signedContract, pdfBuffer);
        } catch (driveError) {
            console.error('Google Drive backup failed (non-blocking):', driveError);
        }

        res.render('success', { title: '簽署完成' });
    } catch (error) {
        console.error('💥 CRITICAL FAILURE in submitSignature:');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        if (error.cause) console.error('Error Cause:', error.cause);

        res.status(500).send(`簽署失敗 - 錯誤訊息: ${error.message}`);
    }
};

module.exports = {
    signContractPage,
    downloadSignedPdf,
    verifyContract,
    submitSignature
};
