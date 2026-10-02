/**
 * Role-Based Authorization Middleware
 * Verifies that the authenticated user possesses one of the allowed roles
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    next();
  };
};

module.exports = {
  authorizeRoles,
};
