const express = require('express');
const router = express.Router();

const storeController = require('../controllers/storeController');
const ratingController = require('../controllers/ratingController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  validateStoreListQuery,
  validateStoreIdParam,
  validateRatingBody,
} = require('../validators/userStoreValidator');

router.get('/', authenticate, authorizeRoles('USER'), validateStoreListQuery, storeController.listStoresForUser);

router.post(
  '/:storeId/rating',
  authenticate,
  authorizeRoles('USER'),
  validateStoreIdParam,
  validateRatingBody,
  ratingController.submitRating
);

router.patch(
  '/:storeId/rating',
  authenticate,
  authorizeRoles('USER'),
  validateStoreIdParam,
  validateRatingBody,
  ratingController.modifyRating
);

module.exports = router;
