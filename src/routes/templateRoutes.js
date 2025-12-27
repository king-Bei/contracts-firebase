const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');

// 管理合約範本頁面
router.get('/', templateController.listTemplates);

// 建立新範本頁面
router.get('/new', templateController.newTemplatePage);

// 建立新範本
router.post('/new', templateController.createTemplate);

// 編輯範本頁面
router.get('/edit/:id', templateController.editTemplatePage);

// 更新範本
router.post('/edit/:id', templateController.updateTemplate);

// 切換範本狀態
router.post('/:id/toggle', templateController.toggleTemplate);

module.exports = router;
