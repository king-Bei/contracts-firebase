// src/routes/adminRoutes.js

const express = require('express');
const userModel = require('../models/userModel');
const { auth, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// 對此路由下的所有請求都套用 auth 和 admin 中介軟體
router.use(auth, admin);

/**
 * @route   GET /api/admin/users
 * @desc    管理員取得所有使用者列表
 * @access  Private (Admin)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await userModel.findAll();
    res.json(users);
  } catch (error) {
    console.error('Admin get users error:', error.message);
    res.status(500).send('伺服器錯誤');
  }
});

/**
 * @route   POST /api/admin/users
 * @desc    管理員新增業務員
 * @access  Private (Admin)
 */
router.post('/users', async (req, res) => {
  const { employee_id, password, name, role } = req.body;

  if (!employee_id || !password || !name || !role) {
    return res.status(400).json({ message: '請提供員工編號、密碼、姓名和角色。' });
  }

  if (role !== 'salesperson' && role !== 'admin') {
      return res.status(400).json({ message: '角色只能是 "admin" 或 "salesperson"。' });
  }

  try {
    // 檢查員工編號是否已存在
    const existingUser = await userModel.findByEmployeeId(employee_id);
    if (existingUser) {
      return res.status(409).json({ message: '此員工編號已被註冊。' });
    }

    const newUser = await userModel.create({ employee_id, password, name, role });
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Admin create user error:', error.message);
    res.status(500).send('伺服器錯誤');
  }
});

/**
 * @route   PUT /api/admin/users/:id
 * @desc    管理員修改使用者資訊 (姓名、角色、狀態)
 * @access  Private (Admin)
 */
router.put('/users/:id', async (req, res) => {
  const { name, role, is_active } = req.body;
  const { id } = req.params;

  if (typeof name !== 'string' || typeof role !== 'string' || typeof is_active !== 'boolean') {
      return res.status(400).json({ message: '請提供正確格式的姓名(string)、角色(string)和啟用狀態(boolean)。' });
  }

  try {
    const updatedUser = await userModel.update(id, { name, role, is_active });
    if (!updatedUser) {
      return res.status(404).json({ message: '找不到指定的使用者。' });
    }
    res.json(updatedUser);
  } catch (error) {
    console.error('Admin update user error:', error.message);
    res.status(500).send('伺服器錯誤');
  }
});

// 停用使用者的路由可以實作為 DELETE 或 PUT/PATCH
// 這裡我們用 PUT 來表示狀態變更，符合軟刪除的語意
// router.put('/users/:id/deactivate', ...);
// 或是使用 DELETE
// router.delete('/users/:id', ...);

module.exports = router;