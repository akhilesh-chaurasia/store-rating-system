const { pool } = require('../config/db');

/**
 * GET /api/owner/dashboard
 * Store Owner Dashboard.
 * Returns:
 *   - store: id, name, email, address
 *   - averageRating: numeric (2 decimal precision, or 0)
 *   - totalRatings: numeric count of ratings (or 0)
 *   - ratings: list of users who submitted ratings (userName, userEmail, userAddress, rating)
 *
 * Rules:
 *   - Strictly derived from authenticated req.user.id (never trusts client-supplied ownerId/storeId).
 *   - Returns HTTP 404 if no store is associated with this owner.
 *   - Never exposes password_hash.
 */
const getOwnerDashboard = async (req, res, next) => {
  try {
    const ownerId = req.user.id;

    // 1. Fetch store owned by authenticated user
    const [storeRows] = await pool.execute(
      'SELECT id, name, email, address, owner_id FROM stores WHERE owner_id = ? ORDER BY id ASC LIMIT 1',
      [ownerId]
    );

    if (storeRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found for this owner',
      });
    }

    const store = storeRows[0];

    // 2. Fetch aggregate rating metrics for this store
    const [[metrics]] = await pool.execute(
      'SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating FROM ratings WHERE store_id = ?',
      [store.id]
    );

    const totalRatings = Number(metrics.totalRatings || 0);
    const averageRating = totalRatings === 0 ? 0 : Number(Number(metrics.averageRating).toFixed(2));

    // 3. Fetch ratings and rating user details
    const [ratingRows] = await pool.execute(
      `SELECT
        r.id AS ratingId,
        r.user_id AS userId,
        u.name AS userName,
        u.email AS userEmail,
        u.address AS userAddress,
        r.rating,
        r.created_at AS createdAt
      FROM ratings r
      INNER JOIN users u ON u.id = r.user_id
      WHERE r.store_id = ?
      ORDER BY r.created_at DESC, r.id DESC`,
      [store.id]
    );

    const ratings = ratingRows.map((row) => ({
      userId: Number(row.userId),
      userName: row.userName,
      userEmail: row.userEmail,
      userAddress: row.userAddress,
      rating: Number(row.rating),
      createdAt: row.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        store: {
          id: store.id,
          name: store.name,
          email: store.email,
          address: store.address,
        },
        averageRating,
        totalRatings,
        ratings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/owner/ratings
 * Optional paginated and sorted list of ratings for the owner's store.
 * Supports: sortBy, sortOrder, page, limit
 */
const getOwnerRatings = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { sortBy, sortOrder, page, limit } = req.ownerRatingsQuery;

    // 1. Fetch store owned by authenticated user
    const [storeRows] = await pool.execute(
      'SELECT id, name, email, address, owner_id FROM stores WHERE owner_id = ? ORDER BY id ASC LIMIT 1',
      [ownerId]
    );

    if (storeRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Store not found for this owner',
      });
    }

    const store = storeRows[0];

    // 2. Fetch total count of ratings for pagination
    const [[countResult]] = await pool.execute(
      'SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating FROM ratings WHERE store_id = ?',
      [store.id]
    );

    const totalRatings = Number(countResult.totalRatings || 0);
    const totalPages = totalRatings === 0 ? 0 : Math.ceil(totalRatings / limit);
    const averageRating = totalRatings === 0 ? 0 : Number(Number(countResult.averageRating).toFixed(2));
    const offset = (page - 1) * limit;

    // 3. Fetch sorted and paginated ratings
    const listSql = `
      SELECT
        r.id AS ratingId,
        r.user_id AS userId,
        u.name AS userName,
        u.email AS userEmail,
        u.address AS userAddress,
        r.rating,
        r.created_at AS createdAt
      FROM ratings r
      INNER JOIN users u ON u.id = r.user_id
      WHERE r.store_id = ?
      ORDER BY ${sortBy} ${sortOrder}, r.id ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [ratingRows] = await pool.execute(listSql, [store.id, limit, offset]);

    const ratings = ratingRows.map((row) => ({
      userId: Number(row.userId),
      userName: row.userName,
      userEmail: row.userEmail,
      userAddress: row.userAddress,
      rating: Number(row.rating),
      createdAt: row.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        store: {
          id: store.id,
          name: store.name,
          email: store.email,
          address: store.address,
        },
        averageRating,
        totalRatings,
        ratings,
        pagination: {
          page,
          limit,
          total: totalRatings,
          totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOwnerDashboard,
  getOwnerRatings,
};
