const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const USER_SELECT_FIELDS = 'id, name, email, address, role, created_at';
const USER_DETAIL_FIELDS = 'id, name, email, address, role';
const STORE_INSERT_FIELDS = 'name, email, address, owner_id';
const STORE_DETAIL_FIELDS = 'id, name, email, address, owner_id';

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

/**
 * Admin Create User
 * POST /api/admin/users
 * Only ADMIN role allowed. Can create USER / OWNER / ADMIN.
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email, address, password, role } = req.body;

    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
      });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, address, role) VALUES (?, ?, ?, ?, ?)`,
      [name, email, passwordHash, address, role]
    );

    const [[userRow]] = await pool.execute(
      `SELECT ${USER_DETAIL_FIELDS} FROM users WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user: userRow },
    });
  } catch (error) {
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
 * Admin List Users
 * GET /api/admin/users
 * Supports search (name/email/address), role filter, sort, pagination.
 * Never returns password_hash.
 */
const listUsers = async (req, res, next) => {
  try {
    const { search, role, sortBy, sortOrder, page, limit } = req.adminQuery;

    const whereClauses = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      whereClauses.push('(name LIKE ? OR email LIKE ? OR address LIKE ?)');
      params.push(like, like, like);
    }

    if (role) {
      whereClauses.push('role = ?');
      params.push(role);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [[{ count: total }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM users ${whereSql}`,
      params
    );
    const totalItems = Number(total);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;

    // sortBy is already whitelisted by validator; sortOrder is already one of ['asc','desc']
    const orderBySql = `ORDER BY ${sortBy} ${sortOrder}`;

    const [rows] = await pool.execute(
      `SELECT ${USER_SELECT_FIELDS} FROM users ${whereSql} ${orderBySql} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: {
        users: rows,
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

/**
 * Admin User Details
 * GET /api/admin/users/:id
 * If user is OWNER, include owned stores + their rating summary.
 */
const getUserDetails = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [[userRow]] = await pool.execute(
      `SELECT ${USER_DETAIL_FIELDS} FROM users WHERE id = ?`,
      [userId]
    );

    if (!userRow) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const responseUser = { ...userRow };

    if (userRow.role === 'OWNER') {
      const [storeRows] = await pool.execute(
        `SELECT id, name, email, address FROM stores WHERE owner_id = ?`,
        [userId]
      );

      const stores = [];
      for (const store of storeRows) {
        const [[agg]] = await pool.execute(
          `SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating FROM ratings WHERE store_id = ?`,
          [store.id]
        );
        stores.push({
          id: store.id,
          name: store.name,
          email: store.email,
          address: store.address,
          totalRatings: Number(agg.totalRatings),
          averageRating: Number(Number(agg.averageRating).toFixed(2)),
        });
      }

      const [[ownerAgg]] = await pool.execute(
        `SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating
         FROM ratings r
         INNER JOIN stores s ON s.id = r.store_id
         WHERE s.owner_id = ?`,
        [userId]
      );

      responseUser.stores = stores;
      responseUser.ownerSummary = {
        totalStores: storeRows.length,
        totalRatings: Number(ownerAgg.totalRatings),
        averageRating: Number(Number(ownerAgg.averageRating).toFixed(2)),
      };
    }

    return res.status(200).json({
      success: true,
      data: { user: responseUser },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin Create Store
 * POST /api/admin/stores
 * Only ADMIN. Owner must exist + have role=OWNER.
 */
const createStore = async (req, res, next) => {
  try {
    const { name, email, address, owner_id } = req.body;

    const [[ownerUser]] = await pool.execute(
      'SELECT id, role FROM users WHERE id = ?',
      [owner_id]
    );

    if (!ownerUser) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found',
      });
    }

    if (ownerUser.role !== 'OWNER') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: { owner_id: `User is not a valid OWNER (current role: ${ownerUser.role})` },
      });
    }

    const [[dupEmail]] = await pool.execute(
      'SELECT id FROM stores WHERE email = ?',
      [email]
    );
    if (dupEmail) {
      return res.status(409).json({
        success: false,
        message: 'Store email is already registered',
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO stores (${STORE_INSERT_FIELDS}) VALUES (?, ?, ?, ?)`,
      [name, email, address, owner_id]
    );

    const [[storeRow]] = await pool.execute(
      `SELECT ${STORE_DETAIL_FIELDS} FROM stores WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: { store: storeRow },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return res.status(409).json({
        success: false,
        message: 'Store email is already registered',
      });
    }
    if (error.code && error.code.startsWith('ER_')) {
      return res.status(400).json({
        success: false,
        message: 'Database constraint violated',
      });
    }
    next(error);
  }
};

/**
 * Admin List Stores
 * GET /api/admin/stores
 * Search: s.name, s.email, s.address + owner name/email
 * Sort: 7 whitelisted fields (incl average_rating aggregation)
 * Pagination: parameterized LIMIT/OFFSET
 */
const listStores = async (req, res, next) => {
  try {
    const { search, sortBy, sortOrder, page, limit } = req.adminStoreQuery;

    const whereClauses = [];
    const params = [];
    const joinOwner = 'INNER JOIN users u ON u.id = s.owner_id';
    const joinRatings = 'LEFT JOIN ratings r ON r.store_id = s.id';

    if (search) {
      const like = `%${search}%`;
      whereClauses.push('(s.name LIKE ? OR s.email LIKE ? OR s.address LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
      params.push(like, like, like, like, like);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Use a single aggregate query with GROUP BY + LEFT JOIN for ratings.
    const baseFrom = `
      FROM stores s
      ${joinOwner}
      ${joinRatings}
      ${whereSql}
    `;

    const totalSql = `SELECT COUNT(DISTINCT s.id) AS count ${baseFrom}`;
    const [[{ count: total }]] = await pool.execute(totalSql, params);
    const totalItems = Number(total);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;

    const orderBySql = `ORDER BY ${sortBy} ${sortOrder}, s.id ${sortOrder}`;

    const listSql = `
      SELECT
        s.id,
        s.name,
        s.email,
        s.address,
        s.owner_id,
        u.name AS owner_name,
        u.email AS owner_email,
        COALESCE(AVG(r.rating), 0) AS averageRating
      ${baseFrom}
      GROUP BY s.id, u.name, u.email
      ${orderBySql}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.execute(listSql, [...params, limit, offset]);

    const stores = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      address: row.address,
      owner_id: row.owner_id,
      owner: {
        name: row.owner_name,
        email: row.owner_email,
      },
      averageRating: Number(Number(row.averageRating).toFixed(2)),
    }));

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

/**
 * Admin Store Details
 * GET /api/admin/stores/:id
 * Returns: id, name, email, address, owner info, rating aggregate.
 */
const getStoreDetails = async (req, res, next) => {
  try {
    const storeId = req.storeId;

    const detailSql = `
      SELECT
        s.id,
        s.name,
        s.email,
        s.address,
        s.owner_id,
        u.id AS ownerId,
        u.name AS owner_name,
        u.email AS owner_email,
        (SELECT COUNT(*) FROM ratings WHERE store_id = s.id) AS totalRatings,
        (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE store_id = s.id) AS averageRating
      FROM stores s
      INNER JOIN users u ON u.id = s.owner_id
      WHERE s.id = ?
    `;
    const [[storeRow]] = await pool.execute(detailSql, [storeId]);

    if (!storeRow) {
      return res.status(404).json({
        success: false,
        message: 'Store not found',
      });
    }

    const store = {
      id: storeRow.id,
      name: storeRow.name,
      email: storeRow.email,
      address: storeRow.address,
      owner: {
        id: storeRow.ownerId,
        name: storeRow.owner_name,
        email: storeRow.owner_email,
      },
      totalRatings: Number(storeRow.totalRatings),
      averageRating: Number(Number(storeRow.averageRating).toFixed(2)),
    };

    return res.status(200).json({
      success: true,
      data: { store },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardSummary,
  createUser,
  listUsers,
  getUserDetails,
  createStore,
  listStores,
  getStoreDetails,
};
