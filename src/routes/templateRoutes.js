const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// 管理合約範本頁面
router.get('/', templateController.listTemplates);

// 建立新範本頁面
router.get('/new', templateController.newTemplatePage);

// 建立新範本 (支援 PDF 上傳)
router.post('/new', upload.single('base_pdf'), templateController.createTemplate);

// 編輯範本頁面
router.get('/edit/:id', templateController.editTemplatePage);

// 更新範本 (支援 PDF 上傳)
router.post('/edit/:id', upload.single('base_pdf'), templateController.updateTemplate);

// 切換範本狀態
router.post('/:id/toggle', templateController.toggleTemplate);

module.exports = router;
