// src/routes/templateRoutes.js

const express = require('express');
const contractTemplateModel = require('../models/contractTemplateModel');

const router = express.Router();

/**
 * @route   GET /api/templates
 * @desc    取得所有可用的合約範本列表 (供業務員/管理員選用)
 * @access  Private (Authenticated users)
 */
router.get('/', async (req, res) => {
  try {
    // 呼叫 model 中的 findAllActive 函式，它會查詢所有 is_active = TRUE 的範本
    const templates = await contractTemplateModel.findAllActive();
    // 回傳簡化的範本列表 (id, name)，方便前端製作下拉選單
    res.json(templates);
  } catch (error) {
    console.error('Error fetching active templates:', error.message);
    res.status(500).send('伺服器錯誤');
  }
});

/**
 * @route   GET /api/templates/:id
 * @desc    根據 ID 取得單一合約範本的詳細資訊 (包含 variables)
 * @access  Private (Authenticated users)
 */
router.get('/:id', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    if (isNaN(templateId)) {
      return res.status(400).json({ message: '無效的範本 ID。' });
    }

    const template = await contractTemplateModel.findById(templateId);

    if (!template) {
      return res.status(404).json({ message: '找不到指定的合約範本。' });
    }

    res.json(template);
  } catch (error) {
    console.error(`Error fetching template ${req.params.id}:`, error.message);
    res.status(500).send('伺服器錯誤');
  }
});

module.exports = router;
