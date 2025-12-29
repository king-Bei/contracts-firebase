const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const auditLogModel = require('../models/auditLogModel');

const loginPage = (req, res) => {
    res.render('login', { title: '登入', error: null });
};

const login = async (req, res) => {
    const { employee_id, password } = req.body;
    if (!employee_id || !password) {
        return res.render('login', { title: '登入', error: '請提供員工編號和密碼。' });
    }

    try {
        const user = await userModel.findByEmployeeId(employee_id);
        if (!user || !user.is_active) {
            // Log failed login attempt (User not found or inactive)
            auditLogModel.log({
                user_id: null,
                action: 'LOGIN_FAILED',
                resource_id: employee_id, // Log the attempted ID
                details: { reason: 'User not found or inactive' },
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.render('login', { title: '登入', error: '員工編號或密碼錯誤。' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            // Log failed login attempt (Invalid password)
            auditLogModel.log({
                user_id: user.id,
                action: 'LOGIN_FAILED',
                resource_id: user.employee_id,
                details: { reason: 'Invalid password' },
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.render('login', { title: '登入', error: '員工編號或密碼錯誤。' });
        }

        // 登入成功，將使用者資訊存入 session
        req.session.user = {
            id: user.id,
            employee_id: user.employee_id,
            name: user.name,
            role: user.role,
            is_sales: user.is_sales,
            is_manager: user.is_manager,
            can_manage_users: user.can_manage_users,
            can_view_all_contracts: user.can_view_all_contracts,
        };

        // Log successful login
        auditLogModel.log({
            user_id: user.id,
            action: 'LOGIN_SUCCESS',
            resource_id: user.employee_id,
            details: {},
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        const redirectPath = user.role === 'admin' ? '/admin' : '/sales';
        res.redirect(redirectPath);

    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { title: '登入', error: '伺服器發生錯誤。' });
    }
};

const logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/'); // 如果出錯，還是導向首頁
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
};

const privacyPage = (req, res) => {
    res.render('privacy', { title: '個資保護條款' });
};

module.exports = {
    loginPage,
    login,
    logout,
    privacyPage
};
