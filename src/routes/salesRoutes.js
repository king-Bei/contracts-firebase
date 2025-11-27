// src/routes/sales.js
const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { ensureAuthenticated, ensureSales } = require('../middleware/auth');

// 所有 /sales 下的路由都需要先驗證登入狀態與業務員角色
router.use(ensureAuthenticated, ensureSales);

// --- 現有路由 ---
// GET /sales/ - 顯示業務員儀表板 (根路徑)
router.get('/', salesController.getDashboard);
// GET /sales/contracts/new - 顯示建立合約的表單
router.get('/contracts/new', salesController.getNewContractForm);
// POST /sales/contracts - 處理新合約的建立
router.post('/contracts', salesController.createContract);


// --- 新增路由 ---
// GET /sales/contracts/:id - 顯示合約詳情
router.get('/contracts/:id', salesController.getContractDetails);

// POST /sales/contracts/:id/generate-link - 產生簽署連結
router.post('/contracts/:id/generate-link', salesController.generateSigningLink);

// GET /sales/contracts/:id/edit - 顯示編輯合約的表單
router.get('/contracts/:id/edit', salesController.getEditContractForm);

// POST /sales/contracts/:id/edit - 處理合約更新
router.post('/contracts/:id/edit', salesController.updateContract);

// POST /sales/contracts/:id/cancel - 作廢合約
router.post('/contracts/:id/cancel', salesController.cancelContract);


module.exports = router;
