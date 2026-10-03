/**
 * Phase 5: Normal User validators for store listing / storeId param / rating.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
void EMAIL_REGEX;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;
const VALID_SORT_ORDERS = ['asc', 'desc'];

const STORE_LIST_SORT_FIELDS = ['name', 'address', 'average_rating', 'averageRating', 'created_at'];
const STORE_LIST_SORT_MAP = {
  name: 's.name',
  address: 's.address',
  average_rating: 'averageRating',
  averageRating: 'averageRating',
  created_at: 's.created_at',
};

/**
 * Validates query params for GET /api/stores (normal user store listing)
 * Supports: search (name/address), sortBy/sortOrder (whitelist), page/limit
 */
const validateStoreListQuery = (req, res, next) => {
  const errors = {};
  const q = req.query || {};

  const search = q.search ? String(q.search).trim() : '';
  const sortByRaw = q.sortBy ? String(q.sortBy).trim() : 'name';
  const sortOrderRaw = q.sortOrder ? String(q.sortOrder).trim().toLowerCase() : 'asc';

  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;

  if (q.page !== undefined && q.page !== '') {
    const p = parseInt(q.page, 10);
    if (Number.isNaN(p) || p < 1) errors.page = 'page must be a positive integer';
    else page = p;
  }

  if (q.limit !== undefined && q.limit !== '') {
    const l = parseInt(q.limit, 10);
    if (Number.isNaN(l) || l < 1) errors.limit = 'limit must be a positive integer';
    else if (l > MAX_LIMIT) errors.limit = `limit must not exceed ${MAX_LIMIT}`;
    else limit = l;
  }

  if (sortByRaw && !STORE_LIST_SORT_FIELDS.includes(sortByRaw)) {
    errors.sortBy = `sortBy must be one of: ${STORE_LIST_SORT_FIELDS.join(', ')}`;
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

  req.storeListQuery = {
    search,
    sortBy: STORE_LIST_SORT_MAP[sortByRaw] || STORE_LIST_SORT_MAP.name,
    sortOrder: sortOrderRaw || 'asc',
    page,
    limit,
  };

  next();
};

/**
 * Validates the :storeId URL segment for /api/stores/:storeId/rating
 * Enforces positive integer; sets req.storeId
 */
const validateStoreIdParam = (req, res, next) => {
  const raw = req.params?.storeId;
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: { storeId: 'storeId must be a positive integer' },
    });
  }
  req.storeId = n;
  next();
};

/**
 * Validates request body for POST/PATCH /api/stores/:storeId/rating
 * Accepts only a rating integer between 1 and 5 inclusive.
 */
const validateRatingBody = (req, res, next) => {
  const errors = {};
  const { rating } = req.body || {};

  if (rating === undefined || rating === null || rating === '') {
    errors.rating = 'rating is required';
  } else if (typeof rating !== 'number' || !Number.isInteger(rating)) {
    errors.rating = 'rating must be an integer';
  } else if (rating < 1 || rating > 5) {
    errors.rating = 'rating must be between 1 and 5';
  } else {
    req.body.rating = rating;
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
  validateStoreListQuery,
  validateStoreIdParam,
  validateRatingBody,
  STORE_LIST_SORT_FIELDS,
  STORE_LIST_SORT_MAP,
  VALID_SORT_ORDERS,
};
