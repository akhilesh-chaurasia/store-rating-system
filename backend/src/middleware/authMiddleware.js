const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/authConfig');
const { COOKIE_NAME } = require('../config/cookieConfig');

/**
 * Authentication Middleware
 * Verifies JWT token from HTTP-only cookie and sets req.user
 */
const authenticate = (req, res, next) => {
  // Read token from cookies (via cookie-parser or header fallback)
  let token = req.cookies?.[COOKIE_NAME];

  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(new RegExp(`(^|;\\s*)${COOKIE_NAME}=([^;]*)`));
    if (match) {
      token = decodeURIComponent(match[2]);
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  try {
    const jwtSecret = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret);

    if (!decoded || !decoded.userId || !decoded.role) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token payload.',
      });
    }

    // Attach verified user identity to request object
    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
};

module.exports = {
  authenticate,
};
