const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
} = require('../validators/authValidator');

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);

// Protected routes (Requires valid JWT cookie)
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.patch('/password', authenticate, validateChangePassword, authController.changePassword);

module.exports = router;
