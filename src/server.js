// 確保在本地開發時能加載 .env 檔案
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const templateRoutes = require('./routes/templateRoutes');
const salesRoutes = require('./routes/salesRoutes');
const publicRoutes = require('./routes/publicRoutes');

// Middleware
const { checkAuth, checkAdmin } = require('./middleware/authMiddleware');

const app = express();
// 在 Cloud Run 或其他代理後端運行時，必須信任 proxy 才能正確設定 secure cookie
app.set('trust proxy', 1);

const PORT = process.env.PORT || 8080;

// --- 檢查必要環境變數 ---
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  警告：未設定 SESSION_SECRET 環境變數！');
  console.warn('⚠️  系統將自動產生一組臨時密鑰，這會導致每次重啟伺服器時所有使用者需重新登入。');
  console.warn('⚠️  請在生產環境 (Cloud Run 等) 的環境變數設定中加入 SESSION_SECRET。');
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}

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
const contractModel = require('./models/contractModel');
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

// Protected Sales Routes
app.use('/sales', checkAuth, salesRoutes);

// Root Redirect
app.get('/', (req, res) => {
  if (req.session.user) {
    const redirectPath = req.session.user.role === 'admin' ? '/admin' : '/sales';
    res.redirect(redirectPath);
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
const userModel = require('./models/userModel');
const contractTemplateModel = require('./models/contractTemplateModel');
const contractModel = require('./models/contractModel');
const fileModel = require('./models/fileModel');

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
    // Don't crash the server, but log heavily. 
    // In strict environments, process.exit(1) might be better.
  }
}

// Server Start
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
