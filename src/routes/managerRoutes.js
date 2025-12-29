const express = require('express');
const router = express.Router();
const managerController = require('../controllers/managerController');

// Dashboard
router.get('/dashboard', managerController.dashboard);

// View Contract Details
router.get('/contracts/:id', managerController.viewContract);

// Approve
router.post('/contracts/:id/approve', managerController.approveContract);

// Reject
router.post('/contracts/:id/reject', managerController.rejectContract);

module.exports = router;
