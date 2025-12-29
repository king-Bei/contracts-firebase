const checkAuth = (req, res, next) => {
  if (req.session.user) {
    res.locals.user = req.session.user; // 將使用者資訊傳遞給 view
    next();
  } else {
    res.redirect('/login');
  }
};

const checkAdmin = (req, res, next) => {
  if (req.session.user && (
    req.session.user.role === 'admin' ||
    req.session.user.can_manage_users ||
    req.session.user.can_view_all_contracts
  )) {
    next();
  } else {
    res.status(403).send('權限不足：需要管理員權限');
  }
};

const checkManager = (req, res, next) => {
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.is_manager)) {
    next();
  } else {
    res.status(403).send('權限不足：需要主管權限');
  }
};

module.exports = {
  checkAuth,
  checkAdmin,
  checkManager,
};