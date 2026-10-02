const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { getJwtSecret, getJwtExpiresIn } = require('../config/authConfig');
const { COOKIE_NAME, getCookieOptions, getClearCookieOptions } = require('../config/cookieConfig');

/**
 * Public User Registration
 * POST /api/auth/register
 * Enforces role = 'USER' regardless of request payload
 */
const register = async (req, res, next) => {
  try {
    const { name, email, address, password } = req.body;

    // 1. Check if email already exists
    const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
      });
    }

    // 2. Hash password securely using bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Security Rule: ALWAYS assign 'USER' role for public registration
    const userRole = 'USER';

    // 4. Insert user using parameterized SQL query
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, address, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, address, userRole]
    );

    const newUserId = result.insertId;

    // 5. Return success without exposing password_hash
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: newUserId,
          name,
          email,
          address,
          role: userRole,
        },
      },
    });
  } catch (error) {
    // Final protection against duplicate email race condition
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
      });
    }
    next(error);
  }
};

/**
 * User Login
 * POST /api/auth/login
 * Validates credentials, sets HTTP-only JWT cookie
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Query user by email
    const [users] = await pool.execute(
      'SELECT id, name, email, password_hash, address, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      // Generic message to avoid email enumeration
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const user = users[0];

    // 2. Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // 3. Generate JWT containing only necessary identifiers
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret_key_for_dev_change_in_prod';
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1d';

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: jwtExpiresIn }
    );

    // 4. Set HTTP-only cookie
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    // 5. Return user profile without password_hash
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          address: user.address,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Current User
 * GET /api/auth/me
 * Fetches fresh user data from database using req.user.id
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.execute(
      'SELECT id, name, email, address, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = users[0];

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          address: user.address,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change Password
 * PATCH /api/auth/password
 * Verifies current password and updates password_hash
 */
const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // 1. Fetch existing password hash for the authenticated user
    const [users] = await pool.execute('SELECT id, password_hash FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = users[0];

    // 2. Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // 3. Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 4. Update password hash in database
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout
 * POST /api/auth/logout
 * Clears HTTP-only JWT authentication cookie
 */
const logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, getClearCookieOptions());
  return res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
};

module.exports = {
  register,
  login,
  getMe,
  changePassword,
  logout,
};
