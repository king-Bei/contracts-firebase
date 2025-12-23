// 確保在本地開發時能加載 .env 檔案
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const https = require('https');
const PDFDocument = require('pdfkit');
const { google } = require('googleapis');

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

const renderTemplateWithVariables = (content, variableValues, templateVariables, options = {}) => {
  const { wrapBold = false, signatureImage = null, signaturePlaceholder = '簽署欄位' } = options;
  let filled = content || '';

  const values = (typeof variableValues === 'string')
    ? JSON.parse(variableValues || '{}')
    : (variableValues || {});
  
  const definitions = Array.isArray(templateVariables) ? templateVariables : [];
  const valueMap = new Map(Object.entries(values));

  // If we have definitions, iterate in that order. Otherwise, iterate over the given values.
  const iterable = definitions.length > 0 ? definitions : Array.from(valueMap.keys()).map(key => ({ key }));

  iterable.forEach(item => {
    const key = item.key;
    if (!key) return;

    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    if (!filled.match(regex)) return;

    const value = valueMap.get(key);
    let displayValue;

    if (item.type === 'checkbox') {
        const checked = [true, 'true', 'on', 1, '1', 'yes', '已勾選'].includes(value);
        displayValue = checked ? '已勾選' : '未勾選';
    } else if (value === undefined || value === null) {
        displayValue = '';
    } else if (Array.isArray(value)) {
        displayValue = value.join(', ');
    } else {
        displayValue = String(value);
    }
    
    if (wrapBold && displayValue && typeof displayValue === 'string' && !displayValue.trim().startsWith('<')) {
      displayValue = `<strong>${displayValue}</strong>`;
    }

    filled = filled.replace(regex, displayValue);
  });

  // Handle signature
  if (signatureImage) {
    const signatureTag = `<div class="mt-2"><img src="${signatureImage}" alt="簽名圖片" style="max-height: 220px;"></div>`;
    const sigRegex = new RegExp(`{{\\s*${signaturePlaceholder}\\s*}}`, 'g');
    if (sigRegex.test(filled)) {
      filled = filled.replace(sigRegex, signatureTag);
    } else {
      filled += `\n\n<div>${signaturePlaceholder}：${signatureTag}</div>`;
    }
  }

  return filled;
};

const normalizeVariableValues = (rawValues, templateVariables = []) => {
  const output = {};
  const incoming = (rawValues && typeof rawValues === 'object') ? rawValues : {};
  const definitions = Array.isArray(templateVariables) ? templateVariables : [];

  definitions.forEach(variable => {
    const key = variable.key || variable.name;
    if (!key) return;
    const type = (variable.type || 'text').toLowerCase();
    const incomingValue = incoming[key];

    if (type === 'checkbox') {
      const normalized = Array.isArray(incomingValue) ? incomingValue : [incomingValue];
      const checked = normalized.some(v => v === true || v === 'true' || v === 'on' || v === 1 || v === '1' || v === 'yes' || v === '已勾選');
      output[key] = Boolean(checked);
    } else {
      output[key] = typeof incomingValue === 'string' ? incomingValue.trim() : (incomingValue ?? '');
    }
  });

  // 保留未在範本定義的其他欄位
  Object.entries(incoming).forEach(([key, value]) => {
    if (!(key in output)) {
      output[key] = value;
    }
  });

  return output;
};

const fetchImageBuffer = (url) => {
  return new Promise(resolve => {
    if (!url) return resolve(null);

    // data URL
    if (url.startsWith('data:image')) {
      const base64 = url.split(',')[1];
      try {
        return resolve(Buffer.from(base64, 'base64'));
      } catch (err) {
        return resolve(null);
      }
    }

    try {
      https.get(url, res => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => resolve(Buffer.concat(data)));
      }).on('error', () => resolve(null));
    } catch (err) {
      resolve(null);
    }
  });
};

const htmlToPlain = (html) => {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const parseStyleMap = (styleString = '') => {
  const styles = {};
  styleString.split(';').forEach(pair => {
    const [rawKey, rawVal] = pair.split(':');
    if (!rawKey || !rawVal) return;
    styles[rawKey.trim().toLowerCase()] = rawVal.trim();
  });
  return styles;
};

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
};

const extractContentPartsWithImages = (html) => {
  const parts = [];
  if (!html) return parts;

  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index);
    const textContent = htmlToPlain(before);
    if (textContent) {
      parts.push({ type: 'text', content: textContent });
    }
    const src = match[1];
    const fullTag = match[0] || '';
    const styleMatch = fullTag.match(/style=["']([^"']*)["']/i);
    const widthMatch = fullTag.match(/\bwidth=["']([^"']+)["']/i);
    const heightMatch = fullTag.match(/\bheight=["']([^"']+)["']/i);
    const styles = parseStyleMap(styleMatch ? styleMatch[1] : '');
    if (widthMatch && !styles.width) styles.width = widthMatch[1];
    if (heightMatch && !styles.height) styles.height = heightMatch[1];

    if (src) {
      parts.push({ type: 'image', src, styles });
    }
    lastIndex = imgRegex.lastIndex;
  }

  const remaining = html.slice(lastIndex);
  const remainingText = htmlToPlain(remaining);
  if (remainingText) {
    parts.push({ type: 'text', content: remainingText });
  }

  return parts;
};

const computeImageOptions = (styles = {}, pageWidth = 400, pageHeight = 400) => {
  const parseLength = (value, base) => {
    if (!value) return null;
    const trimmed = value.trim();
    const percentMatch = trimmed.match(/^([0-9.]+)%$/);
    if (percentMatch) {
      return base * (parseFloat(percentMatch[1]) / 100);
    }
    const pxMatch = trimmed.match(/^([0-9.]+)px$/);
    if (pxMatch) {
      return parseFloat(pxMatch[1]);
    }
    const numMatch = trimmed.match(/^([0-9.]+)$/);
    if (numMatch) {
      return parseFloat(numMatch[1]);
    }
    return null;
  };

  const widthVal = parseLength(styles.width, pageWidth);
  const heightVal = parseLength(styles.height, pageHeight);
  const maxWidthVal = parseLength(styles['max-width'], pageWidth);
  const maxHeightVal = parseLength(styles['max-height'], pageHeight);

  let targetWidth = widthVal || maxWidthVal || pageWidth;
  let targetHeight = heightVal || maxHeightVal || null;

  if (maxWidthVal && targetWidth > maxWidthVal) {
    targetWidth = maxWidthVal;
  }
  if (maxHeightVal && targetHeight && targetHeight > maxHeightVal) {
    targetHeight = maxHeightVal;
  }

  const options = { align: 'left' };
  if (targetWidth && targetHeight) {
    options.fit = [targetWidth, targetHeight];
  } else if (targetWidth) {
    options.width = targetWidth;
  } else if (targetHeight) {
    options.height = targetHeight;
  } else {
    options.fit = [pageWidth, pageHeight / 2];
  }
  return options;
};

const formatSignedFilename = (contract) => {
  const signedDate = contract.signed_at ? new Date(contract.signed_at) : new Date();
  const yyyy = signedDate.getFullYear();
  const mm = String(signedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(signedDate.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${contract.id}.pdf`;
};

const normalizePrivateKey = (key) => {
  if (!key) return key;
  let normalized = key.trim();
  // strip surrounding quotes if accidentally included
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  if (normalized.startsWith("'") && normalized.endsWith("'")) {
    normalized = normalized.slice(1, -1);
  }
  // handle escaped and Windows line endings
  normalized = normalized.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return normalized;
};

let driveClient = null;
const getDriveClient = () => {
  if (driveClient) return driveClient;
  if (process.env.ENABLE_DRIVE_BACKUP !== 'true') {
    return null;
  }
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

  if (!clientEmail || !privateKey || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
    console.warn('Google Drive 未設定，跳過自動上傳簽署 PDF。');
    return null;
  }

  const auth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/drive.file']
  );
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
};

const uploadSignedPdfToDrive = async (contract, pdfBuffer) => {
  if (process.env.ENABLE_DRIVE_BACKUP !== 'true') return null;
  const drive = getDriveClient();
  if (!drive) return null;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const filename = formatSignedFilename(contract);

  try {
    const fileMetadata = {
      name: filename,
      parents: [folderId],
    };

    const media = {
      mimeType: 'application/pdf',
      body: Readable.from(pdfBuffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink, webContentLink',
    });
    return response.data;
  } catch (error) {
    console.error('上傳簽署 PDF 至 Google Drive 失敗:', error.message);
    return null;
  }
};

const NOTO_SANS_TC_URL = 'https://fonts.gstatic.com/ea/notosanstc/v1/NotoSansTC-Regular.otf';
const LOCAL_TCFONT_PATH = path.join(__dirname, '..', 'fonts', 'NotoSansTC-Regular.otf');
let cachedTcFont = null;

const fetchFontBuffer = (url) => {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    try {
      https.get(url, res => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => resolve(Buffer.concat(data)));
      }).on('error', () => resolve(null));
    } catch (err) {
      resolve(null);
    }
  });
};

const getTraditionalChineseFont = async () => {
  if (cachedTcFont) return cachedTcFont;
  try {
    if (fs.existsSync(LOCAL_TCFONT_PATH)) {
      cachedTcFont = fs.readFileSync(LOCAL_TCFONT_PATH);
      return cachedTcFont;
    }
  } catch (err) {
    // ignore and fallback to remote
  }
  cachedTcFont = await fetchFontBuffer(NOTO_SANS_TC_URL);
  return cachedTcFont;
};

const SIGN_PLACEHOLDER = '簽署欄位';

const applyContractPdfContent = async (doc, contract) => {
  const tcFont = await getTraditionalChineseFont();
  if (tcFont) {
    doc.registerFont('NotoTC', tcFont);
    doc.font('NotoTC');
  }

  // 標頭資訊
  if (contract.template_logo_url) {
    const logoBuffer = await fetchImageBuffer(contract.template_logo_url);
    if (logoBuffer) {
      doc.image(logoBuffer, { fit: [220, 120], align: 'center' });
      doc.moveDown();
    }
  }

  doc.fontSize(16).text(contract.template_name || '合約', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`客戶：${contract.client_name || '-'}`);
  doc.text(`狀態：${contract.status}`);
  if (contract.signed_at) {
    doc.text(`簽署時間：${new Date(contract.signed_at).toLocaleString()}`);
  }
  doc.moveDown();

  // 內容
  const filledContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
    wrapBold: false,
    signatureImage: null,
    signaturePlaceholder: SIGN_PLACEHOLDER,
  });
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const parts = filledContent.split(SIGN_PLACEHOLDER);
  const hasSignature = Boolean(contract.signature_image);
  let sigBuffer = null;
  if (hasSignature) {
    sigBuffer = await fetchImageBuffer(contract.signature_image);
  }

  doc.fontSize(12);
  for (let i = 0; i < parts.length; i++) {
    const contentBlocks = extractContentPartsWithImages(parts[i]);
    for (const block of contentBlocks) {
      if (block.type === 'text') {
        doc.text(block.content);
        doc.moveDown(0.5);
      } else if (block.type === 'image') {
        const imgBuffer = block.src.startsWith('data:')
          ? dataUrlToBuffer(block.src)
          : await fetchImageBuffer(block.src);
        if (imgBuffer) {
          const imgOptions = computeImageOptions(block.styles, pageWidth, pageHeight);
          doc.image(imgBuffer, imgOptions);
        } else {
          doc.text('[圖片無法取得]');
        }
        doc.moveDown(0.5);
      }
    }

    const needsSignature = hasSignature && i < parts.length - 1;
    if (needsSignature) {
      doc.moveDown(0.5);
      if (sigBuffer) {
        doc.image(sigBuffer, { fit: [pageWidth * 0.6, 200], align: 'left' });
      } else {
        doc.text('[簽名圖片無法取得]');
      }
      doc.moveDown(0.5);
    }
  }
};

const streamContractPdf = async (res, contract) => {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="contract-${contract.id}.pdf"`);
  doc.pipe(res);
  await applyContractPdfContent(doc, contract);
  doc.end();
};

const generateContractPdfBuffer = (contract) => {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      await applyContractPdfContent(doc, contract);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

const markContractVerified = (req, token) => {
  if (!req.session.verifiedContracts) {
    req.session.verifiedContracts = {};
  }
  req.session.verifiedContracts[token] = true;
};

const isContractVerified = (req, token) => {
  return Boolean(req.session.verifiedContracts && req.session.verifiedContracts[token]);
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

// 個資保護條款
app.get('/privacy', (req, res) => {
  res.render('privacy', { title: '個資保護條款' });
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
    const { salesperson_id, start_date, end_date, status } = req.query;

    const parsedSalespersonId = salesperson_id ? parseInt(salesperson_id, 10) : null;
    const parsedStart = start_date ? new Date(start_date) : null;
    const parsedEnd = end_date ? new Date(end_date) : null;
    const normalizedStatus = status || 'ALL';

    const contracts = await contractModel.findAllWithFilters({
      salespersonId: !isNaN(parsedSalespersonId) ? parsedSalespersonId : null,
      startDate: parsedStart && !isNaN(parsedStart) ? parsedStart : null,
      endDate: parsedEnd && !isNaN(parsedEnd) ? parsedEnd : null,
      status: normalizedStatus,
    });

    const salesUsers = users.filter(u => u.role === 'salesperson');
    res.render('admin', { 
      title: '管理員後台', 
      users: users,
      salesUsers,
      contracts: contracts,
      filters: {
        salesperson_id: salesperson_id || '',
        start_date: start_date || '',
        end_date: end_date || '',
        status: normalizedStatus,
      },
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

// 管理員查看單一合約
app.get('/admin/contracts/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    let contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }

    if (!contract.short_link_code) {
      const shortCode = await contractModel.ensureShortLinkCode(contract.id);
      contract = { ...contract, short_link_code: shortCode };
    }

    const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
      wrapBold: true,
      signatureImage: contract.signature_image,
    });
    const fullShareLink = `${req.protocol}://${req.get('host')}/contracts/sign/${contract.signing_link_token}`;
    const shortShareLink = `${req.protocol}://${req.get('host')}/s/${contract.short_link_code || contract.signing_link_token}`;

    res.render('admin-contract-details', {
      title: '合約檢視',
      contract,
      previewContent,
      shareLink: fullShareLink,
      shortShareLink,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Failed to load admin contract view:', error);
    res.status(500).send('無法載入合約資訊');
  }
});

// 管理員下載合約 PDF
app.get('/admin/contracts/:id/pdf', checkAuth, checkAdmin, async (req, res) => {
  try {
    const contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }
    await streamContractPdf(res, contract);
  } catch (error) {
    console.error('Failed to download contract pdf (admin):', error);
    res.status(500).send('無法產生 PDF');
  }
});

app.post('/admin/templates/new', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { name, content } = req.body;
    const variables = req.body.variables ? JSON.parse(req.body.variables) : [];

    await contractTemplateModel.create({
      name,
      content,
      variables,
      logo_url: req.body.logo_url?.trim() || null,
    });
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
      logo_url: req.body.logo_url?.trim() || null,
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
    return 'ID,狀態,客戶名稱,簽署日期,建立日期,業務員,合約屬性\n';
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
    const flashMessage = req.session.flashMessage || null;
    delete req.session.flashMessage;

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
      flashMessage,
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

// 業務員變更密碼頁面
app.get('/sales/password', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  const flash = req.session.passwordFlash || null;
  delete req.session.passwordFlash;

  res.render('sales/change-password', {
    title: '變更密碼',
    user: req.session.user,
    flash,
  });
});

// 處理業務員變更密碼
app.post('/sales/password', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    req.session.passwordFlash = { type: 'danger', message: '請完整填寫目前密碼與新密碼。' };
    return res.redirect('/sales/password');
  }

  if (new_password !== confirm_password) {
    req.session.passwordFlash = { type: 'warning', message: '兩次輸入的新密碼不一致。' };
    return res.redirect('/sales/password');
  }

  if (new_password.length < 8) {
    req.session.passwordFlash = { type: 'warning', message: '新密碼長度需至少 8 碼。' };
    return res.redirect('/sales/password');
  }

  try {
    const user = await userModel.findByIdWithPassword(req.session.user.id);
    if (!user || !user.is_active) {
      req.session.passwordFlash = { type: 'danger', message: '帳號狀態異常，請聯繫管理員。' };
      return res.redirect('/sales/password');
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      req.session.passwordFlash = { type: 'danger', message: '目前密碼驗證失敗。' };
      return res.redirect('/sales/password');
    }

    await userModel.updatePassword(user.id, new_password);
    req.session.passwordFlash = { type: 'success', message: '密碼已更新，請使用新密碼登入。' };
    res.redirect('/sales/password');
  } catch (error) {
    console.error('Failed to update password:', error);
    res.status(500).send('無法更新密碼');
  }
});

// 批次新增合約頁面
app.get('/sales/contracts/bulk', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const templates = await contractTemplateModel.findAllActive();
    const flashMessage = req.session.flashMessage || null;
    delete req.session.flashMessage;

    res.render('sales/bulk-contracts', {
      title: '批次新增合約',
      templates,
      user: req.session.user,
      flashMessage,
    });
  } catch (error) {
    console.error('Failed to load bulk contract page:', error);
    res.status(500).send('無法載入批次新增合約頁面');
  }
});

// 處理批次新增合約
app.post('/sales/contracts/bulk', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const templateId = parseInt(req.body.template_id, 10);
    if (isNaN(templateId)) {
      req.session.flashMessage = '請選擇一個有效的範本後再送出。';
      return res.redirect('/sales/contracts/bulk');
    }

    const template = await contractTemplateModel.findById(templateId);
    if (!template || !template.is_active) {
      req.session.flashMessage = '此範本無法使用，請重新選擇。';
      return res.redirect('/sales/contracts/bulk');
    }
    let templateVariables = [];
    try {
      templateVariables = Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]');
    } catch (err) {
      templateVariables = [];
    }

    let entries = req.body.entries || [];
    if (!Array.isArray(entries)) {
      entries = Object.values(entries);
    }

    const validEntries = entries
      .map(entry => entry || {})
      .filter(entry => typeof entry.client_name === 'string' && entry.client_name.trim().length > 0);

    if (!validEntries.length) {
      req.session.flashMessage = '請至少填寫一位客戶名稱。';
      return res.redirect('/sales/contracts/bulk');
    }

    let successCount = 0;
    const failedClients = [];

    for (const entry of validEntries) {
      const variableValues = typeof entry.variables === 'object' ? entry.variables : {};
      const normalizedVariables = normalizeVariableValues(variableValues, templateVariables);
      try {
        await contractModel.create({
          salesperson_id: req.session.user.id,
          template_id: templateId,
          client_name: entry.client_name.trim(),
          variable_values: normalizedVariables,
        });
        successCount++;
      } catch (err) {
        console.error('Failed to create contract in bulk:', err);
        failedClients.push(entry.client_name.trim());
      }
    }

    const messages = [];
    if (successCount) {
      messages.push(`成功建立 ${successCount} 份合約`);
    }
    if (failedClients.length) {
      messages.push(`未能建立：${failedClients.join(', ')}`);
    }

    req.session.flashMessage = messages.join('；') || '批次建立已完成';
    res.redirect('/sales');
  } catch (error) {
    console.error('Failed to process bulk contract creation:', error);
    res.status(500).send('批次建立合約時發生錯誤');
  }
});

// 處理新增合約邏輯
app.post('/sales/contracts', checkAuth, async (req, res) => {
  try {
    const { client_name, template_id } = req.body;
    const variables = typeof req.body.variables === 'object' ? req.body.variables : {};
    const salesperson_id = req.session.user.id;

    const template = await contractTemplateModel.findById(template_id);
    if (!template || !template.is_active) {
      return res.status(400).send('此範本無法使用，請重新選擇。');
    }

    let templateVariables = [];
    try {
      templateVariables = Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]');
    } catch (err) {
      templateVariables = [];
    }
    const normalizedVariables = normalizeVariableValues(variables, templateVariables);

    const contractData = {
      salesperson_id,
      template_id,
      client_name,
      variable_values: normalizedVariables || {},
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
    let contract = await contractModel.findById(req.params.id);
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

    let templateVariables = [];
    try {
      if (Array.isArray(contract.template_variables)) {
        templateVariables = contract.template_variables;
      } else if (contract.template_variables) {
        templateVariables = JSON.parse(contract.template_variables || '[]');
      }
    } catch (err) {
      templateVariables = [];
    }

    const normalizedVariables = normalizeVariableValues(updatedVariables, templateVariables);

    await contractModel.update(contract.id, {
      client_name: req.body.client_name,
      variable_values: normalizedVariables,
    });

    res.redirect(`/sales/contracts/${contract.id}`);
  } catch (error) {
    console.error('Failed to update contract:', error);
    res.status(500).send('無法更新合約');
  }
});

// 作廢合約
app.post('/sales/contracts/:id/cancel', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }

  try {
    const contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }

    if (contract.salesperson_id !== req.session.user.id) {
      return res.status(403).send('您無權作廢此合約');
    }

    if (contract.status === 'SIGNED') {
      req.session.flashMessage = '已簽署的合約無法作廢。';
      return res.redirect(`/sales/contracts/${contract.id}`);
    }

    if (contract.status === 'CANCELLED') {
      req.session.flashMessage = '此合約已作廢。';
      return res.redirect(`/sales/contracts/${contract.id}`);
    }

    const cancelled = await contractModel.cancel(contract.id, req.session.user.id);
    req.session.flashMessage = cancelled ? '合約已成功作廢。' : '作廢失敗，請稍後再試。';
    res.redirect('/sales');
  } catch (error) {
    console.error('Failed to cancel contract:', error);
    res.status(500).send('無法作廢合約');
  }
});

// 公開簽署頁面
app.get('/contracts/sign/:token', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }

    const isVerified = isContractVerified(req, req.params.token);
    const canSign = contract.status === 'PENDING_SIGNATURE';

    // For non-signable contracts, render the final content on the server.
    if (!canSign) {
      const finalContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
        wrapBold: true,
        signatureImage: contract.signature_image,
      });
      return res.render('sign-contract', {
        title: '合約檢視',
        signingToken: req.params.token,
        contract,
        previewContent: finalContent,
        isVerified,
        canSign,
        error: null,
        statusMessage: '此合約目前無法簽署。',
      });
    }

    // For signable contracts, pass data to the view for rendering, including inputs.
    res.render('sign-contract', {
      title: '合約簽署',
      signingToken: req.params.token,
      contract,
      previewContent: null, // The view will now handle rendering
      isVerified,
      canSign,
      error: null,
      statusMessage: null,
    });
  } catch (error) {
    console.error('Failed to load signing page:', error);
    res.status(500).send('無法載入簽署頁面');
  }
});

// 公開下載 PDF（僅已簽署）
app.get('/contracts/sign/:token/pdf', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }
    if (contract.status !== 'SIGNED') {
      return res.status(400).send('合約尚未簽署，無法下載 PDF');
    }
    await streamContractPdf(res, contract);
  } catch (error) {
    console.error('Failed to download public contract pdf:', error);
    res.status(500).send('無法產生 PDF');
  }
});

// 驗證碼驗證
app.post('/contracts/sign/:token/verify', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }

    const canSign = contract.status === 'PENDING_SIGNATURE';
    const previewContent = isContractVerified(req, req.params.token)
      ? renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
          wrapBold: true,
          signatureImage: contract.signature_image,
        })
      : null;

    const { verification_code } = req.body;
    if (!contract.verification_code_hash) {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: null,
        isVerified: false,
        canSign,
        error: '目前無法驗證此合約，請聯繫您的業務員。',
        statusMessage: canSign ? null : '此合約目前無法簽署。',
      });
    }

    const isCodeValid = await bcrypt.compare(verification_code || '', contract.verification_code_hash);

    if (!isCodeValid) {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: null,
        isVerified: false,
        canSign,
        error: '驗證碼錯誤，請重新輸入。',
        statusMessage: canSign ? null : '此合約目前無法簽署。',
      });
    }

    markContractVerified(req, req.params.token);
    res.redirect(`/contracts/sign/${req.params.token}`);
  } catch (error) {
    console.error('Failed to verify code:', error);
    res.status(500).send('驗證失敗，請稍後再試。');
  }
});

app.post('/contracts/sign/:token', async (req, res) => {
  try {
    const contract = await contractModel.findByToken(req.params.token);
    if (!contract) {
      return res.status(404).send('簽署連結無效');
    }

    const { agree_terms, signature_data, customer_variables } = req.body;
    const isVerified = isContractVerified(req, req.params.token);

    if (!isVerified) {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: null,
        isVerified: false,
        canSign: contract.status === 'PENDING_SIGNATURE',
        error: '請先完成驗證碼驗證後再簽署。',
        statusMessage: null,
      });
    }

    const reRenderablePreview = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
        wrapBold: true,
        signatureImage: contract.signature_image,
      });

    if (contract.status !== 'PENDING_SIGNATURE') {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: reRenderablePreview,
        isVerified,
        canSign: false,
        error: null,
        statusMessage: '此合約目前無法簽署。',
      });
    }

    if (!agree_terms) {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: reRenderablePreview,
        isVerified,
        canSign: true,
        error: '請先同意個資保護條款。',
        statusMessage: null,
      });
    }

    if (!signature_data) {
      return res.render('sign-contract', {
        title: '合約簽署',
        signingToken: req.params.token,
        contract,
        previewContent: reRenderablePreview,
        isVerified,
        canSign: true,
        error: '請提供簽名。',
        statusMessage: null,
      });
    }
    
    const existingVariables = contract.variable_values || {};
    const customerVariables = customer_variables || {};
    const finalVariables = { ...existingVariables, ...customerVariables };
    const normalizedFinalVariables = normalizeVariableValues(finalVariables, contract.template_variables);

    const updated = await contractModel.markAsSigned(contract.id, signature_data, normalizedFinalVariables);
    const signedContract = { ...contract, ...updated };

    if (process.env.ENABLE_DRIVE_BACKUP === 'true') {
      try {
        const pdfBuffer = await generateContractPdfBuffer(signedContract);
        await uploadSignedPdfToDrive(signedContract, pdfBuffer);
      } catch (err) {
        console.error('簽署後自動備份 PDF 失敗:', err);
      }
    }

    if (req.session.verifiedContracts) {
      delete req.session.verifiedContracts[req.params.token];
    }
    
    const finalPreviewContent = renderTemplateWithVariables(signedContract.template_content, signedContract.variable_values, signedContract.template_variables, {
      wrapBold: true,
      signatureImage: signedContract.signature_image,
    });

    res.render('sign-contract', {
      title: '合約已完成',
      signingToken: req.params.token,
      contract: signedContract,
      previewContent: finalPreviewContent,
      isVerified: true,
      canSign: false,
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

    if (!contract.short_link_code) {
      const shortCode = await contractModel.ensureShortLinkCode(contract.id);
      contract = { ...contract, short_link_code: shortCode };
    }

    const previewContent = renderTemplateWithVariables(contract.template_content, contract.variable_values, contract.template_variables, {
      wrapBold: true,
      signatureImage: contract.signature_image,
    });
    const plaintextCode = contract.verification_code_plaintext || req.session.lastGeneratedCode || null;
    delete req.session.lastGeneratedCode;

    const fullShareLink = `${req.protocol}://${req.get('host')}/contracts/sign/${contract.signing_link_token}`;
    const shortShareLink = `${req.protocol}://${req.get('host')}/s/${contract.short_link_code || contract.signing_link_token}`;

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

// 業務員下載合約 PDF
app.get('/sales/contracts/:id/pdf', checkAuth, async (req, res) => {
  if (req.session.user.role !== 'salesperson') {
    return res.status(403).send('權限不足');
  }
  try {
    let contract = await contractModel.findById(req.params.id);
    if (!contract) {
      return res.status(404).send('找不到合約');
    }
    if (contract.salesperson_id !== req.session.user.id) {
      return res.status(403).send('您無權下載此合約');
    }
    if (!contract.short_link_code) {
      const shortCode = await contractModel.ensureShortLinkCode(contract.id);
      contract = { ...contract, short_link_code: shortCode };
    }
    await streamContractPdf(res, contract);
  } catch (error) {
    console.error('Failed to download contract pdf:', error);
    res.status(500).send('無法產生 PDF');
  }
});

// 簽署短網址導向
app.get('/s/:code', async (req, res) => {
  try {
    const short = await contractModel.findByShortCode(req.params.code);
    const targetToken = short?.signing_link_token || req.params.code; // 舊連結仍可直接使用 token
    res.redirect(302, `/contracts/sign/${targetToken}`);
  } catch (error) {
    console.error('Failed to resolve short signing link:', error);
    res.status(500).send('無法導向簽署頁面');
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
