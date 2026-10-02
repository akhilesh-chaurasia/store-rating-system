/**
 * Centralized Cookie Configuration
 * Configures HTTP-only cookies for JWT token storage.
 * Cookie maxAge is dynamically synchronized with JWT_EXPIRES_IN.
 */
const { parseDurationToMs } = require('./authConfig');

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
  const maxAge = parseDurationToMs(expiresIn);

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax'),
    maxAge, // Synchronized with JWT_EXPIRES_IN
    path: '/',
  };
};

const getClearCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax'),
    path: '/',
  };
};

module.exports = {
  COOKIE_NAME: 'token',
  getCookieOptions,
  getClearCookieOptions,
};
