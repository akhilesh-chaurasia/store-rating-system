const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.get('/dashboard', authenticate, authorizeRoles('ADMIN'), adminController.getDashboardSummary);

module.exports = router;
