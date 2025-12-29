const contractModel = require('../models/contractModel');
const db = require('../db');
const { renderTemplateWithVariables } = require('../utils/templateUtils');

const dashboard = async (req, res) => {
    try {
        // Find all pending approval contracts
        // We can reuse findAllWithFilters but need to make sure we can filter by status 'PENDING_APPROVAL'
        // Since findAllWithFilters supports status filter, we use it.
        const { status, page, limit } = req.query;

        // Defaults
        const currentPage = page ? parseInt(page, 10) : 1;
        const currentLimit = limit ? parseInt(limit, 10) : 10;
        const offset = (currentPage - 1) * currentLimit;

        // Allowed statuses for manager to see. User request: "Manager review can query all contract lists"
        // So we default to 'PENDING_APPROVAL' if nothing selected? Or 'ALL'?
        // "主管審核可查詢所有合約列表" -> Manager Review can query ALL.
        // But the primary purpose is approval. Let's default to PENDING_APPROVAL if no status provided, 
        // BUT allow changing to ALL.
        const filterStatus = status || 'PENDING_APPROVAL';

        const contracts = await contractModel.findAllWithFilters({
            status: filterStatus,
            limit: currentLimit,
            offset: offset
        });

        const totalContracts = await contractModel.countAllWithFilters({
            status: filterStatus
        });

        const totalPages = Math.ceil(totalContracts / currentLimit);

        res.render('manager/dashboard', {
            title: '主管審核',
            contracts: contracts,
            filters: {
                status: filterStatus,
                limit: currentLimit
            },
            pagination: {
                current: currentPage,
                total: totalPages,
                limit: currentLimit
            }
        });
    } catch (error) {
        console.error('Failed to load manager dashboard:', error);
        res.status(500).send('無法載入儀表板');
    }
};

const approveContract = async (req, res) => {
    try {
        const contractId = req.params.id;
        const managerId = req.session.user.id;

        await contractModel.approve(contractId, managerId);
        // Optionally redirect back to dashboard with success message
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Failed to approve contract:', error);
        res.status(500).send('核准失敗');
    }
};

const viewContract = async (req, res) => {
    try {
        let contract = await contractModel.findById(req.params.id);
        if (!contract) {
            return res.status(404).send('找不到合約');
        }

        const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
            wrapBold: true,
            signatureImage: contract.signature_image,
        });

        res.render('manager/contract-details', {
            title: '合約審核',
            contract,
            previewContent,
            user: req.session.user,
        });
    } catch (error) {
        console.error('Failed to load manager contract view:', error);
        res.status(500).send('無法載入合約資訊');
    }
};

const rejectContract = async (req, res) => {
    try {
        const contractId = req.params.id;
        const managerId = req.session.user.id;
        const reason = req.body.reason; // If we implement a reason modal

        await contractModel.reject(contractId, managerId, reason);
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Failed to reject contract:', error);
        res.status(500).send('駁回失敗');
    }
};

module.exports = {
    dashboard,
    approveContract,
    rejectContract,
    viewContract
};
