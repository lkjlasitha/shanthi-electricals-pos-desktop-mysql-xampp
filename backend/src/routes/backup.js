const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/backupController');
const { authenticate, requirePermission } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const ok = file.originalname.toLowerCase().endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    callback(ok ? null : new Error('Only .xlsx backup files are accepted.'), ok);
  },
});

router.use(authenticate, requirePermission('settings.manage'));
router.get('/export', controller.exportBackup);
router.post('/import', upload.single('backup'), controller.importBackup);

module.exports = router;
