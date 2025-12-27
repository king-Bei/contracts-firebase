const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const multer = require('multer');

// Configure multer for this router
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
});

// Signing process
router.get('/sign/:token', publicController.signContractPage);
router.post('/sign/:token/verify', publicController.verifyContract); // Verify code

router.post('/sign/:token', upload.any(), publicController.submitSignature); // Submit signature + images

// Public PDF download
router.get('/sign/:token/pdf', publicController.downloadSignedPdf);

module.exports = router;
