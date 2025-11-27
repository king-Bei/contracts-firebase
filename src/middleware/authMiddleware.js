// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');

/**
 * 驗證 JWT 的中介軟體
 */
function auth(req, res, next) {
  // 從 request header 取得 token
  const authHeader = req.header('Authorization');

  // 檢查是否提供 token
  if (!authHeader) {
    return res.status(401).json({ message: '沒有提供權杖，授權被拒絕。' });
  }

  // 權杖格式應為 'Bearer <token>'
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: '權杖格式不正確，授權被拒絕。' });
  }

  try {
    // 驗證 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 將解碼後的使用者資訊附加到 request 物件上
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ message: '權杖無效。' });
  }
}

/**
 * 檢查使用者是否為管理員的中介軟體
 */
function admin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: '權限不足，需要管理員身份。' });
  }
}

module.exports = { auth, admin };