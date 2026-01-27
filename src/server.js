// src/server.js
console.log('🚀 應用程式啟動中 (Server Startup)...');
const PORT = parseInt(process.env.PORT || '8080', 10);

process.on('uncaughtException', (err) => {
  console.error('💥 未捕獲的異常 (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 未處理的 Promise 拒絕 (Unhandled Rejection):', reason);
});

const express = require('express');
const app = express();

// --- [CRITICAL 1] 立即監聽埠號 ---
// 這是為了解決 Cloud Run 啟動 TCP 探測失敗的問題。
// 我們在載入任何 Model 之前就先監聽。
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ [READY] Server is listening on http://0.0.0.0:${PORT}`);
  console.log(`🚀 就緒探測頁面: http://0.0.0.0:${PORT}/healthz`);
});

// --- [CRITICAL 2] 優先註冊 Health Check ---
app.get('/healthz', (req, res) => {
  // console.log('DEBUG: Health check received');
  res.status(200).send('OK');
});

// --- [PHASE 1] Basic Modules ---
console.log('DEBUG: [STARTUP] Phase 1 - Loading basic modules...');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// --- [PHASE 2] Models & Routes (Background) ---
console.log('DEBUG: [STARTUP] Phase 2 - Loading internal components...');

// 我們使用同步 require 是因為 Node.js 本身就是同步載入模組的
// 但我們放在 listen 之後執行
console.log('DEBUG: -> Loading userModel');
const userModel = require('./models/userModel');
console.log('DEBUG: -> Loading contractTemplateModel');
const contractTemplateModel = require('./models/contractTemplateModel');
console.log('DEBUG: -> Loading contractModel');
const contractModel = require('./models/contractModel');
console.log('DEBUG: -> Loading fileModel');
const fileModel = require('./models/fileModel');

console.log('DEBUG: -> Loading routes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const templateRoutes = require('./routes/templateRoutes');
const salesRoutes = require('./routes/salesRoutes');
const managerRoutes = require('./routes/managerRoutes');
const publicRoutes = require('./routes/publicRoutes');

const { checkAuth, checkAdmin, checkManager } = require('./middleware/authMiddleware');

// --- [PHASE 3] Middleware Configuration ---
console.log('DEBUG: [STARTUP] Phase 3 - Configuring middleware...');

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: false,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static('public'));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// SESSION_SECRET 檢查
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('⚠️  SESSION_SECRET 未設定，自動產生臨時密鑰。');
  sessionSecret = crypto.randomBytes(32).toString('hex');
}

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000
  }
}));

// --- [PHASE 4] Route Mounting ---
console.log('DEBUG: [STARTUP] Phase 4 - Mounting routes...');

app.get('/s/:code', async (req, res) => {
  try {
    const code = req.params.code;
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

app.use('/', authRoutes);
app.use('/contracts', publicRoutes);
app.use('/admin/templates', checkAuth, checkAdmin, templateRoutes);
app.use('/admin', checkAuth, checkAdmin, adminRoutes);
app.use('/manager', checkAuth, checkManager, managerRoutes);
app.use('/sales', checkAuth, salesRoutes);

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

// 404 & Error handlers
app.use((req, res, next) => {
  res.status(404).send('找不到頁面 (404)');
});

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).send('伺服器發生內部錯誤');
});

// --- [PHASE 5] DB Initialization ---
console.log('DEBUG: [STARTUP] Phase 5 - Database Initialization...');

async function initDb() {
  try {
    console.log('Checking database tables...');
    // 檢查 DATABASE_URL 是否存在
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      console.error('❌ 嚴重錯誤：找不到資料庫配置。');
      return;
    }
    await userModel.createUsersTable();
    await contractTemplateModel.createContractTemplatesTable();
    await fileModel.createStorageFilesTable();
    await contractModel.createContractsTable();
    console.log('✅ Database initialization completed.');
  } catch (err) {
    console.error('💥 Database initialization failed:', err);
  }
}

// 背景執行
initDb();

console.log('DEBUG: [STARTUP] All startup phases initiated.');
