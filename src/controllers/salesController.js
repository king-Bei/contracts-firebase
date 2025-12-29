const contractModel = require('../models/contractModel');
const contractTemplateModel = require('../models/contractTemplateModel');
const userModel = require('../models/userModel');
const bcrypt = require('bcryptjs');
const { normalizeVariableValues, renderTemplateWithVariables } = require('../utils/templateUtils');

const salesDashboard = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }
    try {
        const flashMessage = req.session.flashMessage || null;
        delete req.session.flashMessage;

        const { start_date, end_date, status, page, limit } = req.query;
        const salespersonId = req.session.user.id;

        const currentPage = page ? parseInt(page, 10) : 1;
        const currentLimit = limit ? parseInt(limit, 10) : 10;
        const offset = (currentPage - 1) * currentLimit;

        const filters = {
            startDate: start_date,
            endDate: end_date,
            status: status || 'ALL',
        };

        const contracts = await contractModel.findBySalesperson(salespersonId, {
            ...filters,
            limit: currentLimit,
            offset: offset
        });

        const totalContracts = await contractModel.countBySalesperson(salespersonId, filters);
        const totalPages = Math.ceil(totalContracts / currentLimit);

        res.render('sales', {
            title: '業務專區',
            contracts,
            user: req.session.user,
            flashMessage,
            filters: {
                start_date: start_date || '',
                end_date: end_date || '',
                status: status || 'ALL',
                limit: currentLimit
            },
            pagination: {
                current: currentPage,
                total: totalPages,
                limit: currentLimit
            }
        });
    } catch (error) {
        console.error('Failed to load sales page:', error);
        res.status(500).send('無法載入業務員儀表板');
    }
};

const newContractPage = async (req, res) => {
    try {
        const templates = await contractTemplateModel.findAllActive();
        res.render('new-contract', { title: '新增合約', templates: templates });
    } catch (error) {
        console.error('Failed to load new contract page:', error);
        res.status(500).send('無法載入新增合約頁面');
    }
};

const changePasswordPage = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    const flash = req.session.passwordFlash || null;
    delete req.session.passwordFlash;

    res.render('sales/change-password', {
        title: '變更密碼',
        user: req.session.user,
        flash,
    });
};

const updatePassword = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
        req.session.passwordFlash = { type: 'danger', message: '請完整填寫目前密碼與新密碼。' };
        return res.redirect('/sales/password');
    }

    if (new_password !== confirm_password) {
        req.session.passwordFlash = { type: 'warning', message: '兩次輸入的新密碼不一致。' };
        return res.redirect('/sales/password');
    }

    if (new_password.length < 8) {
        req.session.passwordFlash = { type: 'warning', message: '新密碼長度需至少 8 碼。' };
        return res.redirect('/sales/password');
    }

    try {
        const user = await userModel.findByIdWithPassword(req.session.user.id);
        if (!user || !user.is_active) {
            req.session.passwordFlash = { type: 'danger', message: '帳號狀態異常，請聯繫管理員。' };
            return res.redirect('/sales/password');
        }

        const isMatch = await bcrypt.compare(current_password, user.password_hash);
        if (!isMatch) {
            req.session.passwordFlash = { type: 'danger', message: '目前密碼驗證失敗。' };
            return res.redirect('/sales/password');
        }

        await userModel.updatePassword(user.id, new_password);
        req.session.passwordFlash = { type: 'success', message: '密碼已更新，請使用新密碼登入。' };
        res.redirect('/sales/password');
    } catch (error) {
        console.error('Failed to update password:', error);
        res.status(500).send('無法更新密碼');
    }
};

const bulkContractPage = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    try {
        const templates = await contractTemplateModel.findAllActive();
        const flashMessage = req.session.flashMessage || null;
        delete req.session.flashMessage;

        res.render('sales/bulk-contracts', {
            title: '批次新增合約',
            templates,
            user: req.session.user,
            flashMessage,
        });
    } catch (error) {
        console.error('Failed to load bulk contract page:', error);
        res.status(500).send('無法載入批次新增合約頁面');
    }
};

const createBulkContracts = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    try {
        const templateId = parseInt(req.body.template_id, 10);
        if (isNaN(templateId)) {
            req.session.flashMessage = '請選擇一個有效的範本後再送出。';
            return res.redirect('/sales/contracts/bulk');
        }

        const template = await contractTemplateModel.findById(templateId);
        if (!template || !template.is_active) {
            req.session.flashMessage = '此範本無法使用，請重新選擇。';
            return res.redirect('/sales/contracts/bulk');
        }
        let templateVariables = [];
        try {
            templateVariables = Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]');
        } catch (err) {
            templateVariables = [];
        }

        let entries = req.body.entries || [];
        if (!Array.isArray(entries)) {
            entries = Object.values(entries);
        }

        const validEntries = entries
            .map(entry => entry || {})
            .filter(entry => typeof entry.client_name === 'string' && entry.client_name.trim().length > 0);

        if (!validEntries.length) {
            req.session.flashMessage = '請至少填寫一位客戶名稱。';
            return res.redirect('/sales/contracts/bulk');
        }

        let successCount = 0;
        const failedClients = [];

        for (const entry of validEntries) {
            const variableValues = typeof entry.variables === 'object' ? entry.variables : {};
            const normalizedVariables = normalizeVariableValues(variableValues, templateVariables);
            try {
                await contractModel.create({
                    salesperson_id: req.session.user.id,
                    template_id: templateId,
                    client_name: entry.client_name.trim(),
                    variable_values: normalizedVariables,
                });
                successCount++;
            } catch (err) {
                console.error('Failed to create contract in bulk:', err);
                failedClients.push(entry.client_name.trim());
            }
        }

        const messages = [];
        if (successCount) {
            messages.push(`成功建立 ${successCount} 份合約`);
        }
        if (failedClients.length) {
            messages.push(`未能建立：${failedClients.join(', ')}`);
        }

        req.session.flashMessage = messages.join('；') || '批次建立已完成';
        res.redirect('/sales');
    } catch (error) {
        console.error('Failed to process bulk contract creation:', error);
        res.status(500).send('批次建立合約時發生錯誤');
    }
};

const createContract = async (req, res) => {
    try {
        const { client_name, template_id } = req.body;
        const variables = typeof req.body.variables === 'object' ? req.body.variables : {};
        const salesperson_id = req.session.user.id;

        const template = await contractTemplateModel.findById(template_id);
        if (!template || !template.is_active) {
            return res.status(400).send('此範本無法使用，請重新選擇。');
        }

        let templateVariables = [];
        try {
            templateVariables = Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]');
        } catch (err) {
            templateVariables = [];
        }
        const normalizedVariables = normalizeVariableValues(variables, templateVariables);

        const contractData = {
            salesperson_id,
            template_id,
            client_name,
            variable_values: normalizedVariables || {},
        };

        const newContract = await contractModel.create(contractData);
        req.session.flashMessage = '合約已建立，請等待主管審核。';
        res.redirect('/sales');

    } catch (error) {
        console.error('Failed to create contract:', error);
        res.status(500).send('無法建立合約');
    }
};

const viewContract = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }
    try {
        let contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }

        if (contract.salesperson_id !== req.session.user.id) {
            return res.status(403).send('您無權檢視此合約');
        }

        if (!contract.short_link_code) {
            const shortCode = await contractModel.ensureShortLinkCode(contract.id);
            contract = { ...contract, short_link_code: shortCode };
        }

        const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
            wrapBold: true,
            signatureImage: contract.signature_image,
        });
        const fullShareLink = `${req.protocol}://${req.get('host')}/contracts/sign/${contract.signing_link_token}`;
        const shortShareLink = `${req.protocol}://${req.get('host')}/s/${contract.short_link_code || contract.signing_link_token}`;

        const isApproved = contract.status !== 'PENDING_APPROVAL' && contract.status !== 'REJECTED';

        // Use sales specific view
        res.render('sales/contract-details', {
            title: '合約檢視',
            contract,
            previewContent,
            shareLink: isApproved ? fullShareLink : null,
            shortShareLink: isApproved ? shortShareLink : null,
            plaintextCode: contract.verification_code_plaintext,
            isApproved,
            user: req.session.user,
        });
    } catch (error) {
        console.error('Failed to load contract view:', error);
        res.status(500).send('無法載入合約資訊');
    }
};

const editContractPage = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    try {
        let contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }

        if (contract.salesperson_id !== req.session.user.id) {
            return res.status(403).send('您無權編輯此合約');
        }

        if (contract.status === 'SIGNED') {
            return res.status(400).send('已簽署合約不可修改');
        }

        let templateVariables = [];
        try {
            if (Array.isArray(contract.template_variables)) {
                templateVariables = contract.template_variables;
            } else if (contract.template_variables) {
                templateVariables = JSON.parse(contract.template_variables || '[]');
            }
        } catch (e) {
            templateVariables = [];
        }

        res.render('sales/edit-contract', {
            title: '編輯合約',
            contract,
            templateVariables,
            user: req.session.user,
        });
    } catch (error) {
        console.error('Failed to load edit page:', error);
        res.status(500).send('無法載入編輯頁面');
    }
};

const updateContract = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    try {
        const contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }

        if (contract.salesperson_id !== req.session.user.id) {
            return res.status(403).send('您無權編輯此合約');
        }

        if (contract.status === 'SIGNED') {
            return res.status(400).send('已簽署合約不可修改');
        }

        const isResubmit = contract.status === 'REJECTED';

        const updatedVariables = typeof req.body.variables === 'object' ? req.body.variables : {};

        let templateVariables = [];
        try {
            if (Array.isArray(contract.template_variables)) {
                templateVariables = contract.template_variables;
            } else if (contract.template_variables) {
                templateVariables = JSON.parse(contract.template_variables || '[]');
            }
        } catch (err) {
            templateVariables = [];
        }

        const normalizedVariables = normalizeVariableValues(updatedVariables, templateVariables);

        await contractModel.update(contract.id, {
            client_name: req.body.client_name,
            variable_values: normalizedVariables,
            resubmit: isResubmit
        });

        if (isResubmit) {
            req.session.flashMessage = '合約已重新送審。';
        } else {
            req.session.flashMessage = '合約已更新。';
        }

        res.redirect(`/sales/contracts/${contract.id}`);
    } catch (error) {
        console.error('Failed to update contract:', error);
        res.status(500).send('無法更新合約');
    }
};

const cancelContract = async (req, res) => {
    if (req.session.user.role !== 'salesperson') {
        return res.status(403).send('權限不足');
    }

    try {
        const contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }

        if (contract.salesperson_id !== req.session.user.id) {
            return res.status(403).send('您無權作廢此合約');
        }

        if (contract.status === 'SIGNED') {
            req.session.flashMessage = '已簽署的合約無法作廢。';
            return res.redirect(`/sales/contracts/${contract.id}`);
        }

        if (contract.status === 'CANCELLED') {
            req.session.flashMessage = '此合約已作廢。';
            return res.redirect(`/sales/contracts/${contract.id}`);
        }

        const cancelled = await contractModel.cancel(contract.id, req.session.user.id);
        req.session.flashMessage = cancelled ? '合約已成功作廢。' : '作廢失敗，請稍後再試。';
        res.redirect('/sales');
    } catch (error) {
        console.error('Failed to cancel contract:', error);
        res.status(500).send('無法作廢合約');
    }
};

module.exports = {
    salesDashboard,
    newContractPage,
    changePasswordPage,
    updatePassword,
    bulkContractPage,
    createBulkContracts,
    createContract,
    viewContract,
    editContractPage,
    updateContract,
    cancelContract
};