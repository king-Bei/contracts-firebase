const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 登入頁
router.get('/login', authController.loginPage);

// 處理登入邏輯
router.post('/login', authController.login);

// 登出
router.get('/logout', authController.logout);

// 個資保護條款
router.get('/privacy', authController.privacyPage);

module.exports = router;