const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
// No explicit middleware here because it will be applied in server.js
// router.use(checkAuth, checkAdmin) will be in server.js before mounting this router

// Dashboard
router.get('/', adminController.dashboard);

// User Management
router.post('/users', adminController.createUser);
router.post('/users/deactivate', adminController.deactivateUser);
router.get('/users/edit/:id', adminController.editUserPage);
router.post('/users/edit/:id', adminController.updateUser);

// Contract Management
router.get('/contracts/export', adminController.exportContracts);
router.get('/contracts/:id', adminController.viewContract);
router.get('/contracts/:id/pdf', adminController.downloadContractPdf);

module.exports = router;