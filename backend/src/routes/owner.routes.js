const express = require('express');
const router = express.Router();

const ownerController = require('../controllers/ownerController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const { validateOwnerRatingsQuery } = require('../validators/ownerValidator');

// GET /api/owner/dashboard - Authenticated OWNER only
router.get(
  '/dashboard',
  authenticate,
  authorizeRoles('OWNER'),
  ownerController.getOwnerDashboard
);

// GET /api/owner/ratings - Authenticated OWNER only with pagination & sorting
router.get(
  '/ratings',
  authenticate,
  authorizeRoles('OWNER'),
  validateOwnerRatingsQuery,
  ownerController.getOwnerRatings
);

module.exports = router;
