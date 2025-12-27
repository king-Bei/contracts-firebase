const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

// All routes here should be protected by checkAuth in server.js before mounting or we can duplicate it here.
// But mostly server.js will handle the base middleware.

// Dashboard
router.get('/', salesController.salesDashboard);

// Contract Management
router.get('/contracts/new', salesController.newContractPage);
router.post('/contracts', salesController.createContract);

router.get('/contracts/bulk', salesController.bulkContractPage);
router.post('/contracts/bulk', salesController.createBulkContracts);

router.get('/contracts/:id', salesController.viewContract);
router.get('/contracts/:id/edit', salesController.editContractPage);
router.post('/contracts/:id/edit', salesController.updateContract);
router.post('/contracts/:id/cancel', salesController.cancelContract);

// Password
router.get('/password', salesController.changePasswordPage);
router.post('/password', salesController.updatePassword);

module.exports = router;
