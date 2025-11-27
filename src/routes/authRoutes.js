// src/routes/authRoutes.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    使用者登入並取得 JWT
 * @access  Public
 */
router.post('/login', async (req, res) => {
  const { employee_id, password } = req.body;

  // 1. 驗證請求資料
  if (!employee_id || !password) {
    return res.status(400).json({ message: '請提供員工編號和密碼。' });
  }

  try {
    // 2. 根據員工編號查找使用者
    const user = await userModel.findByEmployeeId(employee_id);

    // 3. 檢查使用者是否存在且為啟用狀態
    if (!user || !user.is_active) {
      // 使用通用錯誤訊息以避免透露帳號是否存在
      return res.status(401).json({ message: '員工編號或密碼錯誤。' });
    }

    // 4. 比較傳入的密碼與資料庫中的雜湊密碼
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: '員工編號或密碼錯誤。' });
    }

    // 5. 密碼正確，產生 JWT
    const payload = {
      user: {
        id: user.id,
        employee_id: user.employee_id,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' }, // Token 有效期 8 小時
      (err, token) => {
        if (err) throw err;
        res.json({ token }); // 回傳 token 給前端
      }
    );
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).send('伺服器錯誤');
  }
});

module.exports = router;