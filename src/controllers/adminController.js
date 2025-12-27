const userModel = require('../models/userModel');
const contractModel = require('../models/contractModel');
const { convertToCSV } = require('../utils/csvUtils');
const { streamContractPdf } = require('../services/pdfService');
const { renderTemplateWithVariables } = require('../utils/templateUtils');

const dashboard = async (req, res) => {
    try {
        const users = await userModel.findAll();
        const { salesperson_id, start_date, end_date, status } = req.query;

        const parsedSalespersonId = salesperson_id ? parseInt(salesperson_id, 10) : null;
        const parsedStart = start_date ? new Date(start_date) : null;
        const parsedEnd = end_date ? new Date(end_date) : null;
        const normalizedStatus = status || 'ALL';

        const contracts = await contractModel.findAllWithFilters({
            salespersonId: !isNaN(parsedSalespersonId) ? parsedSalespersonId : null,
            startDate: parsedStart && !isNaN(parsedStart) ? parsedStart : null,
            endDate: parsedEnd && !isNaN(parsedEnd) ? parsedEnd : null,
            status: normalizedStatus,
        });

        const salesUsers = users.filter(u => u.role === 'salesperson');
        res.render('admin', {
            title: '管理員後台',
            users: users,
            salesUsers,
            contracts: contracts,
            filters: {
                salesperson_id: salesperson_id || '',
                start_date: start_date || '',
                end_date: end_date || '',
                status: normalizedStatus,
            },
        });
    } catch (error) {
        console.error('Failed to load admin page:', error);
        res.status(500).send('無法載入管理員頁面');
    }
};

const createUser = async (req, res) => {
    const { employee_id, password, name } = req.body;
    const role = 'salesperson'; // 表单默认创建业务员

    try {
        const existingUser = await userModel.findByEmployeeId(employee_id);
        if (existingUser) {
            console.log(`Attempted to create duplicate user: ${employee_id}`);
            return res.redirect('/admin');
        }

        await userModel.create({ employee_id, password, name, role });
        res.redirect('/admin');

    } catch (error) {
        console.error('Failed to create user:', error);
        res.status(500).send('無法建立使用者');
    }
};

const deactivateUser = async (req, res) => {
    const { userId } = req.body;

    // 安全措施：確保管理員不能停用自己
    if (req.session.user.id == userId) {
        console.log(`Admin user ${req.session.user.employee_id} attempted to deactivate themselves.`);
        return res.redirect('/admin');
    }

    try {
        await userModel.deactivate(userId);
        res.redirect('/admin');
    } catch (error) {
        console.error('Failed to deactivate user:', error);
        res.status(500).send('無法停用使用者');
    }
};

const editUserPage = async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id);
        if (!user) {
            return res.status(404).send('找不到使用者');
        }
        res.render('edit-user', { title: '編輯使用者', user: user });
    } catch (error) {
        console.error('Failed to load edit user page:', error);
        res.status(500).send('無法載入編輯頁面');
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, role } = req.body;
    // HTML checkbox 如果沒被勾選，就不會被包含在請求中，所以需要這樣處理
    const is_active = req.body.is_active === 'on';

    try {
        await userModel.update(id, { name, role, is_active });
        res.redirect('/admin');
    } catch (error) {
        console.error('Failed to update user:', error);
        res.status(500).send('無法更新使用者');
    }
};

const exportContracts = async (req, res) => {
    try {
        const contracts = await contractModel.findAll();
        const csv = convertToCSV(contracts);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="contracts.csv"');
        res.status(200).send(Buffer.from('\uFEFF' + csv)); // Add BOM for Excel compatibility
    } catch (error) {
        console.error('Failed to export contracts:', error);
        res.status(500).send('無法匯出合約');
    }
};

const viewContract = async (req, res) => {
    try {
        let contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
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

        res.render('admin-contract-details', {
            title: '合約檢視',
            contract,
            previewContent,
            shareLink: fullShareLink,
            shortShareLink,
            user: req.session.user,
        });
    } catch (error) {
        console.error('Failed to load admin contract view:', error);
        res.status(500).send('無法載入合約資訊');
    }
};

const downloadContractPdf = async (req, res) => {
    try {
        const contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }
        await streamContractPdf(res, contract);
    } catch (error) {
        console.error('Failed to download contract pdf (admin):', error);
        res.status(500).send('無法產生 PDF');
    }
};

module.exports = {
    dashboard,
    createUser,
    deactivateUser,
    editUserPage,
    updateUser,
    exportContracts,
    viewContract,
    downloadContractPdf,
};
