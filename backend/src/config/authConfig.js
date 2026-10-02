/**
 * JWT and Authentication Configuration
 * Reads JWT_SECRET strictly from environment variables without hardcoded fallbacks
 */

/**
 * Returns JWT_SECRET from environment variables.
 * Fails fast with a descriptive error if JWT_SECRET is not configured or is empty.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('FATAL CONFIGURATION ERROR: JWT_SECRET environment variable is required.');
  }
  return secret.trim();
};

/**
 * Returns JWT expiration string from environment variables (e.g., '1d', '12h').
 * Defaults to '1d'.
 */
const getJwtExpiresIn = () => {
  return process.env.JWT_EXPIRES_IN || '1d';
};

/**
 * Converts a duration string (e.g., '1d', '7d', '12h', '30m', '3600s') into milliseconds.
 * Supported units:
 *   - d: days
 *   - h: hours
 *   - m: minutes
 *   - s: seconds
 * Default fallback: 1 day (86,400,000 ms)
 */
const parseDurationToMs = (duration = '1d') => {
  const match = String(duration).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!match) {
    return 24 * 60 * 60 * 1000;
  }
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    case 's':
    default:
      return value * 1000;
  }
};

module.exports = {
  getJwtSecret,
  getJwtExpiresIn,
  parseDurationToMs,
};
