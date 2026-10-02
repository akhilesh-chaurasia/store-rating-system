const { pool } = require('../config/db');

/**
 * Admin Dashboard Summary
 * GET /api/admin/dashboard
 * Only ADMIN role allowed
 * Returns total count of users, stores, and ratings
 */
const getDashboardSummary = async (req, res, next) => {
  try {
    const [[{ count: totalUsers }]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM users'
    );
    const [[{ count: totalStores }]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM stores'
    );
    const [[{ count: totalRatings }]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM ratings'
    );

    return res.status(200).json({
      success: true,
      data: {
        totalUsers: Number(totalUsers),
        totalStores: Number(totalStores),
        totalRatings: Number(totalRatings),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardSummary,
};
