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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
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

const renderTemplateWithVariables = (content, variables = {}) => {
  let filled = content || '';
  let parsedVariables = variables;

  if (typeof variables === 'string') {
    try {
      parsedVariables = JSON.parse(variables || '{}');
    } catch (e) {
      parsedVariables = {};
    }
  }

  Object.entries(parsedVariables || {}).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    filled = filled.replace(regex, value ?? '');
  });
  return filled;
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

app.get('/admin/templates/new', checkAuth, checkAdmin, async (req, res) => {
  res.render('new-template', { title: '建立新合約範本' });
});

app.post('/admin/templates/new', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { name, content } = req.body;
    const variables = req.body.variables ? JSON.parse(req.body.variables) : [];

    await contractTemplateModel.create({ name, content, variables });
    res.redirect('/admin/templates');
  } catch (error) {
    console.error('Failed to create template:', error);
    res.status(500).send('無法建立範本');
  }
});

app.get('/admin/templates/edit/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const template = await contractTemplateModel.findById(req.params.id);
    if (!template) {
      return res.status(404).send('找不到範本');
    }

    res.render('edit-template', {
      title: '編輯合約範本',
      template,
      variables: Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]'),
    });
  } catch (error) {
    console.error('Failed to load template edit page:', error);
    res.status(500).send('無法載入範本編輯頁面');
  }
});

app.post('/admin/templates/edit/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const template = await contractTemplateModel.findById(req.params.id);
    if (!template) {
      return res.status(404).send('找不到範本');
    }

    const variables = req.body.variables ? JSON.parse(req.body.variables) : [];

    await contractTemplateModel.update(req.params.id, {
      name: req.body.name,
      content: req.body.content,
      variables,
      is_active: req.body.is_active === 'on',
    });

    res.redirect('/admin/templates');
  } catch (error) {
    console.error('Failed to update template:', error);
    res.status(500).send('無法更新範本');
  }
});

app.post('/admin/templates/:id/toggle', checkAuth, checkAdmin, async (req, res) => {
  try {
    const template = await contractTemplateModel.findById(req.params.id);
    if (!template) {
      return res.status(404).send('找不到範本');
    }

    await contractTemplateModel.setActive(req.params.id, !template.is_active);
    res.redirect('/admin/templates');
  } catch (error) {
    console.error('Failed to toggle template:', error);
    res.status(500).send('無法更新範本狀態');
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
    const { start_date, end_date, status } = req.query;
    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 3);
    const parsedStart = start_date ? new Date(start_date) : defaultStart;
    const parsedEnd = end_date ? new Date(end_date) : new Date();
    const startDate = isNaN(parsedStart) ? defaultStart : parsedStart;
    const endDate = isNaN(parsedEnd) ? new Date() : parsedEnd;

    const contracts = await contractModel.findBySalesperson(req.session.user.id, {
      startDate,
      endDate,
      status: status || 'ALL',
    });

    res.render('sales', {
      title: '業務員儀表板',
      contracts,
      user: req.session.user,
      filters: {
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        status: status || 'ALL',
      },
    });
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
    const { client_name, template_id } = req.body;
    const variables = typeof req.body.variables === 'object' ? req.body.variables : {};
    const salesperson_id = req.session.user.id;

    const contractData = {
      salesperson_id,
      template_id,
      client_name,
      variable_values: variables || {},
    };

    const newContract = await contractModel.create(contractData);
    req.session.lastGeneratedCode = newContract.verification_code;

    res.redirect(`/sales/contracts/${newContract.id}`);

  } catch (error) {
    console.error('Failed to create contract:', error);
    res.status(500).send('無法建立合約');
  }
});

app.get('/sales/contracts/:id/edit', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }

    if (contract.salesperson_id !== req.session.user.id) {
      return res.status(403).send('您無權編輯此合約');
    }

    if (contract.status === 'SIGNED') {
      return res.status(400).send('已簽署合約不可修改');
    }

    let templateVariables = [];
    try {
      if (Array.isArray(contract.template_variables)) {
        templateVariables = contract.template_variables;
      } else if (contract.template_variables) {
        templateVariables = JSON.parse(contract.template_variables || '[]');
      }
    } catch (e) {
      templateVariables = [];
    }

    res.render('sales/edit-contract', {
      title: '編輯合約',
      contract,
      templateVariables,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Failed to load edit page:', error);
    res.status(500).send('無法載入編輯頁面');
  }
});

app.post('/sales/contracts/:id/edit', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }

    if (contract.salesperson_id !== req.session.user.id) {
      return res.status(403).send('您無權編輯此合約');
    }

    if (contract.status === 'SIGNED') {
      return res.status(400).send('已簽署合約不可修改');
    }

    const updatedVariables = typeof req.body.variables === 'object' ? req.body.variables : {};

    await contractModel.update(contract.id, {
      client_name: req.body.client_name,
      variable_values: updatedVariables,
    });

    res.redirect(`/sales/contracts/${contract.id}`);
  } catch (error) {
    console.error('Failed to update contract:', error);
    res.status(500).send('無法更新合約');
  }
});

// 公開簽署頁面
app.get('/contracts/sign/:token', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }

    if (contract.status !== 'PENDING_SIGNATURE') {
      return res.render('sign-contract', {
        title: '合約簽署',
        contract,
        previewContent: renderTemplateWithVariables(contract.template_content, contract.variable_values),
        error: null,
        statusMessage: '此合約目前無法簽署。',
      });
    }

    res.render('sign-contract', {
      title: '合約簽署',
      contract,
      previewContent: renderTemplateWithVariables(contract.template_content, contract.variable_values),
      error: null,
      statusMessage: null,
    });
  } catch (error) {
    console.error('Failed to load signing page:', error);
    res.status(500).send('無法載入簽署頁面');
  }
});

app.post('/contracts/sign/:token', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }

    const { verification_code, agree_terms, signature_data } = req.body;
    const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values);

    if (contract.status !== 'PENDING_SIGNATURE') {
      return res.render('sign-contract', {
        title: '合約簽署',
        contract,
        previewContent,
        error: null,
        statusMessage: '此合約目前無法簽署。',
      });
    }

    if (!agree_terms) {
      return res.render('sign-contract', {
        title: '合約簽署',
        contract,
        previewContent,
        error: '請先同意個資保護條款。',
        statusMessage: null,
      });
    }

    if (!signature_data) {
      return res.render('sign-contract', {
        title: '合約簽署',
        contract,
        previewContent,
        error: '請提供簽名。',
        statusMessage: null,
      });
    }

    const isCodeValid = await bcrypt.compare(verification_code || '', contract.verification_code_hash);
    if (!isCodeValid) {
      return res.render('sign-contract', {
        title: '合約簽署',
        contract,
        previewContent,
        error: '驗證碼錯誤，請重新輸入。',
        statusMessage: null,
      });
    }

    const updated = await contractModel.markAsSigned(contract.id, signature_data);

    res.render('sign-contract', {
      title: '合約已完成',
      contract: { ...contract, ...updated },
      previewContent,
      error: null,
      statusMessage: '簽署完成！您可以下載或列印此頁面作為憑證。',
    });
  } catch (error) {
    console.error('Failed to submit signature:', error);
    res.status(500).send('無法完成簽署');
  }
});

// 查看單一合約詳情
app.get('/sales/contracts/:id', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }

    if (contract.salesperson_id !== req.session.user.id) {
      return res.status(403).send('您無權查看此合約');
    }

    const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values);
    const plaintextCode = contract.verification_code_plaintext || req.session.lastGeneratedCode || null;
    delete req.session.lastGeneratedCode;

    const fullShareLink = `${req.protocol}://${req.get('host')}/contracts/sign/${contract.signing_link_token}`;
    const shortShareLink = `${req.protocol}://${req.get('host')}/s/${contract.signing_link_token}`;

    res.render('sales/contract-details', {
      title: '合約詳情',
      contract,
      previewContent,
      shareLink: fullShareLink,
      shortShareLink,
      plaintextCode,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Failed to load contract details:', error);
    res.status(500).send('無法載入合約詳情');
  }
});

// 簽署短網址導向
app.get('/s/:token', (req, res) => {
  const target = `/contracts/sign/${req.params.token}`;
  res.redirect(302, target);
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
