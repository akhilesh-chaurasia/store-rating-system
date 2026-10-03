const { pool } = require('../config/db');

/**
 * GET /api/stores
 * Normal User store listing.
 * For each store returns: name, address, averageRating (overall), userRating (current user's rating or null).
 * Supports search (name/address), sort (whitelist), pagination.
 *
 * Strategy to avoid JOIN multiplication:
 *   1) Single aggregate query over (stores LEFT JOIN ratings) grouped by store:
 *      returns store data + AVG(rating) overall + LIMIT/OFFSET page.
 *   2) Separate small query: fetch ratings for the current user ONLY for stores ON THIS PAGE.
 *      O(page_size) rows; 2 queries total, no duplication of stores.
 */
const listStoresForUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { search, sortBy, sortOrder, page, limit } = req.storeListQuery;

    const whereClauses = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      whereClauses.push('(s.name LIKE ? OR s.address LIKE ?)');
      params.push(like, like);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Count distinct stores for pagination total
    const countSql = `
      SELECT COUNT(DISTINCT s.id) AS count
      FROM stores s
      LEFT JOIN ratings r ON r.store_id = s.id
      ${whereSql}
    `;
    const [[{ count: total }]] = await pool.execute(countSql, params);
    const totalItems = Number(total);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;

    // 2. Paginated stores with overall averageRating
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}, s.id ${sortOrder}`;
    const listSql = `
      SELECT
        s.id,
        s.name,
        s.address,
        COALESCE(AVG(r.rating), 0) AS averageRating
      FROM stores s
      LEFT JOIN ratings r ON r.store_id = s.id
      ${whereSql}
      GROUP BY s.id
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const [pageRows] = await pool.execute(listSql, [...params, limit, offset]);

    let stores = pageRows.map((row) => {
      const avg = Number(Number(row.averageRating).toFixed(2));
      return {
        id: row.id,
        name: row.name,
        address: row.address,
        overallRating: avg,
        averageRating: avg,
        userRating: null,
      };
    });

    // 3. Current user's ratings only for stores on this page
    if (stores.length > 0) {
      const ids = stores.map((s) => s.id);
      const placeholders = ids.map(() => '?').join(',');
      const [userRatingRows] = await pool.execute(
        `SELECT store_id, rating FROM ratings WHERE user_id = ? AND store_id IN (${placeholders})`,
        [userId, ...ids]
      );
      const ratingByStore = new Map(userRatingRows.map((r) => [Number(r.store_id), Number(r.rating)]));
      stores = stores.map((s) => ({ ...s, userRating: ratingByStore.has(s.id) ? ratingByStore.get(s.id) : null }));
    }

    return res.status(200).json({
      success: true,
      data: {
        stores,
        pagination: {
          page,
          limit,
          total: totalItems,
          totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listStoresForUser,
};
