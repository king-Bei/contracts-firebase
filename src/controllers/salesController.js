// src/controllers/salesController.js
const db = require('../db'); // 您的資料庫設定檔
const crypto = require('crypto'); // Node.js 內建的加密模組
const bcrypt = require('bcryptjs'); // 用於雜湊驗證碼

// 顯示業務員儀表板
exports.getDashboard = async (req, res) => {
    try {
        const salesId = req.session.user.id; // 從 session 取得登入者的 ID

        // 查詢此業務員建立的所有合約，並依建立時間排序
        const result = await db.query(
            `SELECT id, customer_name, status, created_at 
             FROM contracts 
             WHERE created_by_id = $1 
             ORDER BY created_at DESC`,
            [salesId]
        );

        // 注意：根據您的檔案結構，儀表板檔案是 'sales.ejs'
        // 如果您將它放在 'views/sales/' 目錄下，請使用 'sales/sales'
        res.render('sales', {
            user: req.session.user,
            contracts: result.rows, // 將查詢結果傳遞給 EJS
            title: '業務員儀表板'
        });
    } catch (err) {
        console.error('Error fetching dashboard contracts:', err);
        res.status(500).send('伺服器錯誤');
    }
};


// 顯示合約詳情
exports.getContractDetails = async (req, res) => {
    try {
        console.log(`[getContractDetails] 正在取得合約詳情，ID: ${req.params.id}`);

        const { id } = req.params;
        const salesId = req.session.user.id;

        // 查詢合約，並同時 JOIN 範本資料表以取得範本內容
        const contractResult = await db.query(
            `SELECT c.*, t.content as template_content
             FROM contracts c
             JOIN contract_templates t ON c.template_id = t.id
             WHERE c.id = $1`,
            [id]
        );

        if (contractResult.rows.length === 0) {
            console.log(`[getContractDetails] 找不到合約 ID: ${id}`);
            return res.status(404).send('找不到該合約');
        }

        const contract = contractResult.rows[0];

        // 權限檢查：確保是合約建立者本人在查看
        if (contract.created_by_id !== salesId) {
            console.log(`[getContractDetails] 權限不足，使用者 ${salesId} 嘗試查看合約 ${id}`);
            return res.status(403).send('權限不足，您無法查看此合約');
        }

        // 產生預覽內容：將範本中的 {{變數}} 替換為真實資料
        let previewContent = contract.template_content;
        if (contract.variables) {
            for (const key in contract.variables) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                previewContent = previewContent.replace(regex, String(contract.variables[key]));
            }
        }
        
        // 為了顯示給業務員，我們需要一個臨時的、未加密的驗證碼
        // 注意：這只在產生連結的當下產生，並未儲存
        const plainVerificationCode = req.session.lastGeneratedCode || null;
        delete req.session.lastGeneratedCode; // 顯示一次後就刪除

        console.log(`[getContractDetails] 成功渲染合約詳情頁面，ID: ${id}`);
        res.render('sales/contract-details', {
            user: req.session.user,
            contract,
            previewContent,
            plainVerificationCode, // 傳遞給 EJS
            title: '合約詳情'
        });

    } catch (err) {
        console.error('[getContractDetails] 伺服器錯誤:', err);
        res.status(500).send('伺服器錯誤');
    }
};

// 作廢合約 (軟刪除)
exports.cancelContract = async (req, res) => {
    try {
        const { id } = req.params;
        const salesId = req.session.user.id;

        // 更新資料庫，將狀態設為 'CANCELLED'
        // 只能作廢 'DRAFT' 或 'PENDING_SIGNATURE' 狀態的合約
        const result = await db.query(
            `UPDATE contracts 
             SET status = 'CANCELLED'
             WHERE id = $1 
               AND created_by_id = $2 
               AND (status = 'DRAFT' OR status = 'PENDING_SIGNATURE')`,
            [id, salesId]
        );

        if (result.rowCount === 0) {
            return res.status(403).send('無法作廢此合約，可能權限不足或合約狀態不符。');
        }

        res.redirect('/sales');
    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};

// 產生簽署連結
exports.generateSigningLink = async (req, res) => {
    try {
        const { id } = req.params;
        const salesId = req.session.user.id;

        // 再次驗證權限並取得合約
        const contractResult = await db.query(
            'SELECT id, created_by_id, status FROM contracts WHERE id = $1',
            [id]
        );

        if (contractResult.rows.length === 0) {
            return res.status(404).send('找不到該合約');
        .
        }
        const contract = contractResult.rows[0];
        if (contract.created_by_id !== salesId) {
            return res.status(403).send('權限不足');
        }
        if (contract.status !== 'DRAFT') {
            return res.status(400).send('此合約已產生連結或已完成，無法重複操作');
        }

        // 1. 產生一個安全的、隨機的簽署權杖 (token)
        const signingToken = crypto.randomBytes(32).toString('hex');

        // 2. 產生一個給客戶的、易於輸入的 6 位數字驗證碼
        const plainVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. 將驗證碼進行雜湊，存入資料庫的是雜湊值
        const salt = await bcrypt.genSalt(10);
        const verificationCodeHash = await bcrypt.hash(plainVerificationCode, salt);

        // 4. 設定連結的過期時間 (例如：7 天後)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // 5. 更新資料庫
        await db.query(
            `UPDATE contracts 
             SET status = 'PENDING_SIGNATURE', 
                 signing_token = $1, 
                 verification_code_hash = $2, 
                 token_expires_at = $3 
             WHERE id = $4`,
            [signingToken, verificationCodeHash, expiresAt, id]
        );
        
        // 將明文驗證碼暫存到 session，以便在重導向後顯示給業務員
        req.session.lastGeneratedCode = plainVerificationCode;

        // 6. 重導向回詳情頁
        res.redirect(`/sales/contracts/${id}`);

    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};

// 顯示編輯合約的表單
exports.getEditContractForm = async (req, res) => {
    try {
        const { id } = req.params;
        const salesId = req.session.user.id;

        const contractResult = await db.query('SELECT * FROM contracts WHERE id = $1', [id]);

        if (contractResult.rows.length === 0) {
            return res.status(404).send('找不到該合約');
        }

        const contract = contractResult.rows[0];

        // 權限檢查
        if (contract.created_by_id !== salesId) {
            return res.status(403).send('權限不足');
        }

        // 只有草稿狀態才能編輯
        if (contract.status !== 'DRAFT') {
            return res.status(400).send('此合約已送出，無法編輯');
        }

        res.render('sales/edit-contract', {
            user: req.session.user,
            contract,
            title: '編輯合約'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};

// 處理合約更新
exports.updateContract = async (req, res) => {
    try {
        const { id } = req.params;
        const salesId = req.session.user.id;
        const { customer_name, customer_email, variables } = req.body;

        // 簡單驗證
        if (!customer_name || !customer_email) {
            return res.status(400).send('客戶名稱與 Email 為必填項目');
        }

        let variablesJson;
        try {
            variablesJson = variables ? JSON.parse(variables) : {};
        } catch (e) {
            return res.status(400).send('變數欄位必須是合法的 JSON 格式');
        }

        // 更新資料庫，並加上權限檢查 (created_by_id = $5 AND status = 'DRAFT')
        await db.query(
            `UPDATE contracts 
             SET customer_name = $1, customer_email = $2, variables = $3
             WHERE id = $4 AND created_by_id = $5 AND status = 'DRAFT'`,
            [customer_name, customer_email, variablesJson, id, salesId]
        );

        res.redirect(`/sales/contracts/${id}`);

    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};

// 顯示建立新合約的表單
exports.getNewContractForm = async (req, res) => {
    try {
        const templates = await db.query('SELECT id, name FROM contract_templates WHERE is_active = TRUE ORDER BY name ASC');
        
        res.render('new-contract', {
            user: req.session.user,
            templates: templates.rows,
            title: '建立新合約'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};

// 處理新合約的建立
exports.createContract = async (req, res) => {
    try {
        const { client_name, template_id, variables } = req.body;
        const salesId = req.session.user.id;

        if (!client_name || !template_id) {
            return res.status(400).send('客戶名稱與合約範本為必填項目');
        }

        const result = await db.query(
            'INSERT INTO contracts (customer_name, template_id, created_by_id, variables, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [client_name, template_id, salesId, variables || {}, 'DRAFT']
        );

        const newContractId = result.rows[0].id;
        res.redirect(`/sales/contracts/${newContractId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('伺服器錯誤');
    }
};