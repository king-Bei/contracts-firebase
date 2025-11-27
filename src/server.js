// 確保在本地開發時能加載 .env 檔案
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const userModel = require('./models/userModel');
const contractTemplateModel = require('./models/contractTemplateModel');
const contractModel = require('./models/contractModel');

const app = express();
const PORT = process.env.PORT || 8080;

// --- 設定 View Engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- 中介軟體 (Middleware) ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
    maxAge: 8 * 60 * 60 * 1000 // 8 小時
  }
}));

// --- 自訂認證中介軟體 ---
const checkAuth = (req, res, next) => {
  if (req.session.user) {
    res.locals.user = req.session.user; // 將使用者資訊傳遞給 view
    next();
  } else {
    res.redirect('/login');
  }
};

const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).send('權限不足');
  }
};


// --- 網站頁面路由 ---

// 根目錄，如果已登入就導向對應頁面，否則導向登入頁
app.get('/', (req, res) => {
  if (req.session.user) {
    const redirectPath = req.session.user.role === 'admin' ? '/admin' : '/sales';
    res.redirect(redirectPath);
  } else {
    res.redirect('/login');
  }
});

// 登入頁
app.get('/login', (req, res) => {
  res.render('login', { title: '登入', error: null });
});

// 處理登入邏輯
app.post('/login', async (req, res) => {
  const { employee_id, password } = req.body;
  if (!employee_id || !password) {
    return res.render('login', { title: '登入', error: '請提供員工編號和密碼。' });
  }

  try {
    const user = await userModel.findByEmployeeId(employee_id);
    if (!user || !user.is_active) {
      return res.render('login', { title: '登入', error: '員工編號或密碼錯誤。' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.render('login', { title: '登入', error: '員工編號或密碼錯誤。' });
    }
    
    // 登入成功，將使用者資訊存入 session
    req.session.user = {
      id: user.id,
      employee_id: user.employee_id,
      name: user.name,
      role: user.role,
    };

    const redirectPath = user.role === 'admin' ? '/admin' : '/sales';
    res.redirect(redirectPath);

  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { title: '登入', error: '伺服器發生錯誤。' });
  }
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/'); // 如果出錯，還是導向首頁
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});


// 管理員頁面
app.get('/admin', checkAuth, checkAdmin, async (req, res) => {
  try {
    const users = await userModel.findAll();
    const contracts = await contractModel.findAll();
    res.render('admin', { 
      title: '管理員後台', 
      users: users,
      contracts: contracts 
    });
  } catch (error) {
    console.error('Failed to load admin page:', error);
    res.status(500).send('無法載入管理員頁面');
  }
});

// 處理新增使用者邏輯
app.post('/admin/users', checkAuth, checkAdmin, async (req, res) => {
  const { employee_id, password, name } = req.body;
  const role = 'salesperson'; // 表单默认创建业务员

  try {
    const existingUser = await userModel.findByEmployeeId(employee_id);
    if (existingUser) {
      // 可以在这里添加错误消息闪烁功能，但为了简单起见，先直接重定向
      console.log(`Attempted to create duplicate user: ${employee_id}`);
      return res.redirect('/admin');
    }

    await userModel.create({ employee_id, password, name, role });
    res.redirect('/admin');

  } catch (error) {
    console.error('Failed to create user:', error);
    res.status(500).send('無法建立使用者');
  }
});

// 處理停用使用者邏輯
app.post('/admin/users/deactivate', checkAuth, checkAdmin, async (req, res) => {
  const { userId } = req.body;
  
  // 安全措施：確保管理員不能停用自己
  if (req.session.user.id == userId) {
    console.log(`Admin user ${req.session.user.employee_id} attempted to deactivate themselves.`);
    return res.redirect('/admin');
  }

  try {
    await userModel.deactivate(userId);
    res.redirect('/admin');
  } catch (error) {
    console.error('Failed to deactivate user:', error);
    res.status(500).send('無法停用使用者');
  }
});

// 顯示使用者編輯頁面
app.get('/admin/users/edit/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const user = await userModel.findById(req.params.id);
    if (!user) {
      return res.status(404).send('找不到使用者');
    }
    res.render('edit-user', { title: '編輯使用者', user: user });
  } catch (error) {
    console.error('Failed to load edit user page:', error);
    res.status(500).send('無法載入編輯頁面');
  }
});

// 處理使用者編輯邏輯
app.post('/admin/users/edit/:id', checkAuth, checkAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, role } = req.body;
  // HTML checkbox 如果沒被勾選，就不會被包含在請求中，所以需要這樣處理
  const is_active = req.body.is_active === 'on';

  try {
    await userModel.update(id, { name, role, is_active });
    res.redirect('/admin');
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).send('無法更新使用者');
  }
});

// 匯出合約為 CSV
app.get('/admin/contracts/export', checkAuth, checkAdmin, async (req, res) => {
  try {
    const contracts = await contractModel.findAll();
    const csv = convertToCSV(contracts);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contracts.csv"');
    res.status(200).send(Buffer.from('\uFEFF' + csv)); // Add BOM for Excel compatibility
  } catch (error) {
    console.error('Failed to export contracts:', error);
    res.status(500).send('無法匯出合約');
  }
});

// 管理合約範本頁面
app.get('/admin/templates', checkAuth, checkAdmin, async (req, res) => {
  try {
    const templates = await contractTemplateModel.findAll();
    res.render('manage-templates', { 
      title: '管理合約範本', 
      templates: templates 
    });
  } catch (error) {
    console.error('Failed to load template management page:', error);
    res.status(500).send('無法載入範本管理頁面');
  }
});

function convertToCSV(data) {
  if (!data || data.length === 0) {
    return 'ID,狀態,客戶名稱,簽署日期,建立日期,業務員,範本名稱\n';
  }
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => JSON.stringify(row[header], (key, value) => value === null ? '' : value)).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// 業務員頁面
app.get('/sales', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }
  try {
    const contracts = await contractModel.findBySalesperson(req.session.user.id);
    res.render('sales', { title: '業務員儀表板', contracts: contracts });
  } catch (error) {
    console.error('Failed to load sales page:', error);
    res.status(500).send('無法載入業務員儀表板');
  }
});

// 顯示新增合約頁面
app.get('/sales/contracts/new', checkAuth, async (req, res) => {
  try {
    const templates = await contractTemplateModel.findAllActive();
    res.render('new-contract', { title: '新增合約', templates: templates });
  } catch (error) {
    console.error('Failed to load new contract page:', error);
    res.status(500).send('無法載入新增合約頁面');
  }
});

// 處理新增合約邏輯
app.post('/sales/contracts', checkAuth, async (req, res) => {
  try {
    const { client_name, template_id, variables } = req.body;
    const salesperson_id = req.session.user.id;

    const contractData = {
      salesperson_id,
      template_id,
      client_name,
      variable_values: variables || {},
    };

    const newContract = await contractModel.create(contractData);

    // For now, just redirect to the dashboard.
    // In the future, we could redirect to a page showing the contract details and the verification code.
    res.redirect('/sales');

  } catch (error) {
    console.error('Failed to create contract:', error);
    res.status(500).send('無法建立合約');
  }
});


// --- API 路由 (保持不變) ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const templateRoutes = require('./routes/templateRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/templates', templateRoutes);


// 啟動伺服器函數
async function startServer() {
  try {
    await userModel.createUsersTable();
    await contractTemplateModel.createContractTemplatesTable();
    await contractModel.createContractsTable();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

startServer().catch(err => {
  console.error('Unhandled error during server startup:', err);
  process.exit(1);
});
