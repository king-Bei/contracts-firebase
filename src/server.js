// 確保在本地開發時能加載 .env 檔案
console.log('🚀 應用程式啟動中 (Server Startup)...');
console.log(`DEBUG: Environment = ${process.env.NODE_ENV}, PORT = ${process.env.PORT || 8080}`);

process.on('uncaughtException', (err) => {
  console.error('💥 未捕獲的異常 (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未處理的 Promise 拒絕 (Unhandled Rejection):', reason);
});

const express = require('express');
const app = express();

const PORT = process.env.PORT || 8080;

// 1. Health Check Endpoint (最優先就緒，確保 Cloud Run 探測能通過)
app.get('/healthz', (req, res) => {
  console.log('DEBUG: Health check received');
  res.status(200).send('OK');
});

// 2. 加載所有模組與設定中介軟體 (移到 listen 之前)
if (process.env.NODE_ENV !== 'production') {
  console.log('DEBUG: Loading .env file');
  require('dotenv').config();
}

console.log('DEBUG: Requiring modules...');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log('DEBUG: [3/5] Requiring internal models and routes...');
// Database Initialization Models (Moved to top)
const userModel = require('./models/userModel');
const contractTemplateModel = require('./models/contractTemplateModel');
const contractModel = require('./models/contractModel');
const fileModel = require('./models/fileModel');

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const templateRoutes = require('./routes/templateRoutes');
const salesRoutes = require('./routes/salesRoutes');
const managerRoutes = require('./routes/managerRoutes');
const publicRoutes = require('./routes/publicRoutes');
console.log('DEBUG: [4/5] Internal modules loaded.');

// Middleware
const { checkAuth, checkAdmin, checkManager } = require('./middleware/authMiddleware');

console.log('DEBUG: Configuring middleware...');
// 在 Cloud Run 或其他代理後端運行時，必須信任 proxy 才能正確設定 secure cookie
app.set('trust proxy', 1);

// --- 檢查必要環境變數 ---
function checkEnvVars() {
  const required = ['DATABASE_URL', 'SESSION_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  警告：缺少部分環境變數: ${missing.join(', ')}`);
    if (!process.env.SESSION_SECRET) {
      console.warn('⚠️  SESSION_SECRET 未設定，將自動產生臨時密鑰。這會導致重啟後 Session 失效。');
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    }
    // 注意：DATABASE_URL 的檢查交由 db.js 處理，或者在此處拋出錯誤以阻止啟動
  }
}
checkEnvVars();

// --- 設定 View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 安全性中介軟體 (Security Middleware) ---
// Helmet: 設定 HTTP 標頭以增強安全性
app.use(helmet({
  contentSecurityPolicy: false, // 暫時關閉 CSP 以避免阻擋 EJS 中的 inline scripts/styles
}));

// Rate Limiting: 限制請求頻率
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 300, // 限制每個 IP 在 windowMs 內最多 300 個請求
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 針對登入路由更嚴格的限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 15 分鐘內最多 20 次嘗試
  message: '嘗試登入次數過多，請稍後再試。'
});
app.use('/login', loginLimiter);

// --- 一般中介軟體 ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static('public'));

// Cache-busting middleware
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Session 設定
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 在生產環境中應為 true
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000 // 2 小時
  }
}));

// --- 路由掛載 ---

// Redirect /s/:code to full signing URL
app.get('/s/:code', async (req, res) => {
  try {
    const code = req.params.code;
    // Try to find by short_link_code or token
    let contract = await contractModel.findByShortCode(code);
    if (!contract) {
      contract = await contractModel.findByToken(code);
    }

    if (contract) {
      res.redirect(`/contracts/sign/${contract.signing_link_token}`);
    } else {
      res.status(404).send('連結無效');
    }
  } catch (err) {
    console.error('Short link error:', err);
    res.status(500).send('Server Error');
  }
});

// Public Routes (Login, etc)
app.use('/', authRoutes);

// Public Contract Signing Routes
app.use('/contracts', publicRoutes);

// Protected Admin Routes
app.use('/admin/templates', checkAuth, checkAdmin, templateRoutes);
app.use('/admin', checkAuth, checkAdmin, adminRoutes);
app.use('/manager', checkAuth, checkManager, managerRoutes);

// Protected Sales Routes
app.use('/sales', checkAuth, salesRoutes);

// Root Redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    const user = req.session.user;
    if (user.role === 'admin' || user.can_manage_users || user.can_view_all_contracts) {
      res.redirect('/admin');
    } else if (user.role === 'manager' || user.is_manager) {
      res.redirect('/manager/dashboard');
    } else {
      res.redirect('/sales');
    }
  } else {
    res.redirect('/login');
  }
});

// --- 錯誤處理 (Error Handling) ---

// 404 Handler
app.use((req, res, next) => {
  res.status(404).send('找不到頁面 (404)');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).send('伺服器發生內部錯誤');
});

// --- Database Initialization ---

async function initDb() {
  try {
    console.log('Checking/Creating database tables...');
    await userModel.createUsersTable();
    await contractTemplateModel.createContractTemplatesTable();
    await fileModel.createStorageFilesTable();
    await contractModel.createContractsTable();
    console.log('Database initialization completed.');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

// Health Check Endpoint is at the top of the file

console.log('DEBUG: [5/5] All modules configured. Starting server...');

// 5. Server Start
// 在 Cloud Run 等容器環境中，必須監聽 0.0.0.0 而非 localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on http://0.0.0.0:${PORT}`);
  console.log(`🚀 就緒探測頁面: http://0.0.0.0:${PORT}/healthz`);

  // 背景初始化資料庫
  initDb();
});
