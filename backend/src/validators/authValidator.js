/**
 * Auth input validators
 * Formats validation errors consistently according to specification
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPPERCASE_REGEX = /[A-Z]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>_\-\\\/\[\]~`+=;]/;

/**
 * Validates registration input
 */
const validateRegister = (req, res, next) => {
  const errors = {};
  const { name, email, address, password } = req.body || {};

  // Validate Name: min 20, max 60 characters after trimming
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Name is required';
  } else {
    const trimmedName = name.trim();
    if (trimmedName.length < 20) {
      errors.name = 'Name must be at least 20 characters long';
    } else if (trimmedName.length > 60) {
      errors.name = 'Name must not exceed 60 characters';
    }
  }

  // Validate Email: required, valid format
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address';
  }

  // Validate Address: required, max 400 characters
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    errors.address = 'Address is required';
  } else if (address.length > 400) {
    errors.address = 'Address must not exceed 400 characters';
  }

  // Validate Password: 8-16 chars, at least one uppercase, at least one special char
  if (!password || typeof password !== 'string') {
    errors.password = 'Password is required';
  } else {
    if (password.length < 8 || password.length > 16) {
      errors.password = 'Password must be between 8 and 16 characters long';
    } else if (!UPPERCASE_REGEX.test(password)) {
      errors.password = 'Password must contain at least one uppercase letter';
    } else if (!SPECIAL_CHAR_REGEX.test(password)) {
      errors.password = 'Password must contain at least one special character';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Sanitize values for downstream processing
  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.address = address.trim();

  next();
};

/**
 * Validates login input
 */
const validateLogin = (req, res, next) => {
  const errors = {};
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address';
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

/**
 * Validates change password input
 */
const validateChangePassword = (req, res, next) => {
  const errors = {};
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length === 0) {
    errors.currentPassword = 'Current password is required';
  }

  if (!newPassword || typeof newPassword !== 'string') {
    errors.newPassword = 'New password is required';
  } else {
    if (newPassword.length < 8 || newPassword.length > 16) {
      errors.newPassword = 'New password must be between 8 and 16 characters long';
    } else if (!UPPERCASE_REGEX.test(newPassword)) {
      errors.newPassword = 'New password must contain at least one uppercase letter';
    } else if (!SPECIAL_CHAR_REGEX.test(newPassword)) {
      errors.newPassword = 'New password must contain at least one special character';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateChangePassword,
};
