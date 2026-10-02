const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  validateCreateAdminUser,
  validateListUsersQuery,
  validateUserIdParam,
  validateCreateStore,
  validateListStoresQuery,
  validateStoreIdParam,
} = require('../validators/adminValidator');

router.get('/dashboard', authenticate, authorizeRoles('ADMIN'), adminController.getDashboardSummary);

router.post('/users', authenticate, authorizeRoles('ADMIN'), validateCreateAdminUser, adminController.createUser);

router.get('/users', authenticate, authorizeRoles('ADMIN'), validateListUsersQuery, adminController.listUsers);

router.get('/users/:id', authenticate, authorizeRoles('ADMIN'), validateUserIdParam, adminController.getUserDetails);

router.post('/stores', authenticate, authorizeRoles('ADMIN'), validateCreateStore, adminController.createStore);

router.get('/stores', authenticate, authorizeRoles('ADMIN'), validateListStoresQuery, adminController.listStores);

router.get('/stores/:id', authenticate, authorizeRoles('ADMIN'), validateStoreIdParam, adminController.getStoreDetails);

module.exports = router;
