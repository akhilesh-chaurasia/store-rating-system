/**
 * Phase 6: Store Owner validators
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;
const VALID_SORT_ORDERS = ['asc', 'desc'];

const OWNER_RATINGS_SORT_FIELDS = [
  'userName',
  'name',
  'userEmail',
  'email',
  'rating',
  'created_at',
  'createdAt',
];

const OWNER_RATINGS_SORT_MAP = {
  userName: 'u.name',
  name: 'u.name',
  userEmail: 'u.email',
  email: 'u.email',
  rating: 'r.rating',
  created_at: 'r.created_at',
  createdAt: 'r.created_at',
};

/**
 * Validates query parameters for GET /api/owner/ratings
 * Supports: sortBy, sortOrder, page, limit
 */
const validateOwnerRatingsQuery = (req, res, next) => {
  const errors = {};
  const q = req.query || {};

  const sortByRaw = q.sortBy ? String(q.sortBy).trim() : 'created_at';
  const sortOrderRaw = q.sortOrder ? String(q.sortOrder).trim().toLowerCase() : 'desc';

  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;

  if (q.page !== undefined && q.page !== '') {
    const p = parseInt(q.page, 10);
    if (Number.isNaN(p) || p < 1) {
      errors.page = 'page must be a positive integer';
    } else {
      page = p;
    }
  }

  if (q.limit !== undefined && q.limit !== '') {
    const l = parseInt(q.limit, 10);
    if (Number.isNaN(l) || l < 1) {
      errors.limit = 'limit must be a positive integer';
    } else if (l > MAX_LIMIT) {
      errors.limit = `limit must not exceed ${MAX_LIMIT}`;
    } else {
      limit = l;
    }
  }

  if (sortByRaw && !OWNER_RATINGS_SORT_FIELDS.includes(sortByRaw)) {
    errors.sortBy = `sortBy must be one of: ${OWNER_RATINGS_SORT_FIELDS.join(', ')}`;
  }

  if (sortOrderRaw && !VALID_SORT_ORDERS.includes(sortOrderRaw)) {
    errors.sortOrder = 'sortOrder must be one of: asc, desc';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.ownerRatingsQuery = {
    sortBy: OWNER_RATINGS_SORT_MAP[sortByRaw] || OWNER_RATINGS_SORT_MAP.created_at,
    sortOrder: sortOrderRaw || 'desc',
    page,
    limit,
  };

  next();
};

module.exports = {
  validateOwnerRatingsQuery,
  OWNER_RATINGS_SORT_FIELDS,
  OWNER_RATINGS_SORT_MAP,
  VALID_SORT_ORDERS,
};
