const { pool } = require('../config/db');

/**
 * POST /api/stores/:storeId/rating — Normal User submits a rating
 * Rules:
 *   - Store must exist (otherwise 404)
 *   - One rating per user per store (UNIQUE(user_id,store_id)) → 409 on duplicate
 *   - Uses parameterized SQL throughout.
 */
const submitRating = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const storeId = req.storeId;
    const { rating } = req.body;

    const [[storeExists]] = await pool.execute(
      'SELECT id FROM stores WHERE id = ?',
      [storeId]
    );
    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const [[existing]] = await pool.execute(
      'SELECT id FROM ratings WHERE user_id = ? AND store_id = ?',
      [userId, storeId]
    );
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You have already rated this store',
      });
    }

    await pool.execute(
      'INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, ?)',
      [userId, storeId, rating]
    );

    return res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        storeId,
        rating,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(409).json({
        success: false,
        message: 'You have already rated this store',
      });
    }
    if (
      error.code === 'ER_NO_REFERENCED_ROW_2' ||
      error.errno === 1452 ||
      error.code === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
      error.errno === 3819
    ) {
      return res.status(400).json({
        success: false,
        message: 'Rating could not be saved due to a constraint violation',
      });
    }
    next(error);
  }
};

/**
 * PATCH /api/stores/:storeId/rating — Normal User modifies their existing rating
 * Returns 404 if user has no rating for this store.
 * Always scoped to the currently authenticated user (cannot modify another user's rating).
 */
const modifyRating = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const storeId = req.storeId;
    const { rating } = req.body;

    const [[storeExists]] = await pool.execute(
      'SELECT id FROM stores WHERE id = ?',
      [storeId]
    );
    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const [updateResult] = await pool.execute(
      'UPDATE ratings SET rating = ? WHERE user_id = ? AND store_id = ?',
      [rating, userId, storeId]
    );

    const affectedRows = Number(updateResult.affectedRows || 0);
    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No existing rating found for this store',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Rating updated successfully',
      data: {
        storeId,
        rating,
      },
    });
  } catch (error) {
    if (
      error.code === 'ER_CHECK_CONSTRAINT_VIOLATED' ||
      error.errno === 3819 ||
      error.code === 'ER_NO_REFERENCED_ROW_2' ||
      error.errno === 1452
    ) {
      return res.status(400).json({
        success: false,
        message: 'Rating could not be saved due to a constraint violation',
      });
    }
    next(error);
  }
};

module.exports = {
  submitRating,
  modifyRating,
};
