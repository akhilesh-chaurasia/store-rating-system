/**
 * Admin User Management Input Validators
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPPERCASE_REGEX = /[A-Z]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>_\-\\\/\[\]~`+=;]/;
const VALID_ROLES = ['ADMIN', 'USER', 'OWNER'];
const VALID_SORT_FIELDS = ['name', 'email', 'address', 'role', 'created_at'];
const VALID_SORT_ORDERS = ['asc', 'desc'];

const ALLOWED_SORT_MAP = {
  name: 'name',
  email: 'email',
  address: 'address',
  role: 'role',
  created_at: 'created_at',
};

const STORE_VALID_SORT_FIELDS = ['name', 'email', 'address', 'owner_name', 'owner_email', 'average_rating', 'created_at'];
const STORE_ALLOWED_SORT_MAP = {
  name: 's.name',
  email: 's.email',
  address: 's.address',
  owner_name: 'owner_name',
  owner_email: 'owner_email',
  average_rating: 'averageRating',
  created_at: 's.created_at',
};

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

/**
 * Validates body for POST /api/admin/users (Admin-create-user)
 * Admin can specify any role; role validation is enforced here (cannot be bypassed).
 */
const validateCreateAdminUser = (req, res, next) => {
  const errors = {};
  const { name, email, address, password, role } = req.body || {};

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

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address';
  }

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    errors.address = 'Address is required';
  } else if (address.length > 400) {
    errors.address = 'Address must not exceed 400 characters';
  }

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

  if (!role || typeof role !== 'string') {
    errors.role = 'Role is required';
  } else if (!VALID_ROLES.includes(role.trim().toUpperCase())) {
    errors.role = `Role must be one of: ${VALID_ROLES.join(', ')}`;
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.address = address.trim();
  req.body.role = role.trim().toUpperCase();

  next();
};

/**
 * Validates query params for GET /api/admin/users
 * Handles search, role, sortBy, sortOrder, page, limit.
 * Returns parsed & sanitized values on req.adminQuery.
 */
const validateListUsersQuery = (req, res, next) => {
  const errors = {};
  const q = req.query || {};

  const search = q.search ? String(q.search).trim() : '';
  const roleRaw = q.role ? String(q.role).trim().toUpperCase() : '';
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

  if (roleRaw && !VALID_ROLES.includes(roleRaw)) {
    errors.role = `role filter must be one of: ${VALID_ROLES.join(', ')}`;
  }

  if (sortByRaw && !VALID_SORT_FIELDS.includes(sortByRaw)) {
    errors.sortBy = `sortBy must be one of: ${VALID_SORT_FIELDS.join(', ')}`;
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

  req.adminQuery = {
    search,
    role: roleRaw || null,
    sortBy: ALLOWED_SORT_MAP[sortByRaw] || 'created_at',
    sortOrder: sortOrderRaw || 'desc',
    page,
    limit,
  };

  next();
};

/**
 * Validates /:id path param is a positive integer (store)
 */
const validateUserIdParam = (req, res, next) => {
  const rawId = req.params?.id;
  const n = Number(rawId);
  if (!rawId || !Number.isInteger(n) || n <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: { id: 'id must be a positive integer' },
    });
  }
  req.userId = n;
  next();
};

/**
 * Validates body for POST /api/admin/stores (Admin create store)
 * Owner validation (existence + OWNER role) is performed in the controller
 * (requires DB access). Here we only validate shape/types of owner_id.
 */
const validateCreateStore = (req, res, next) => {
  const errors = {};
  const { name, email, address, owner_id } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.name = 'Name is required';
  } else {
    const t = name.trim();
    if (t.length < 20) errors.name = 'Name must be at least 20 characters long';
    else if (t.length > 60) errors.name = 'Name must not exceed 60 characters';
  }

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Please provide a valid email address';
  }

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    errors.address = 'Address is required';
  } else if (address.length > 400) {
    errors.address = 'Address must not exceed 400 characters';
  }

  if (owner_id === undefined || owner_id === null || owner_id === '') {
    errors.owner_id = 'owner_id is required';
  } else if (!Number.isInteger(Number(owner_id)) || Number(owner_id) <= 0) {
    errors.owner_id = 'owner_id must be a valid positive integer';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.address = address.trim();
  req.body.owner_id = Number(owner_id);

  next();
};

/**
 * Validates query params for GET /api/admin/stores
 * Supports search (name/email/address/owner_name/owner_email),
 * sort (7 whitelisted fields), pagination.
 */
const validateListStoresQuery = (req, res, next) => {
  const errors = {};
  const q = req.query || {};

  const search = q.search ? String(q.search).trim() : '';
  const sortByRaw = q.sortBy ? String(q.sortBy).trim() : 'created_at';
  const sortOrderRaw = q.sortOrder ? String(q.sortOrder).trim().toLowerCase() : 'desc';

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

  if (sortByRaw && !STORE_VALID_SORT_FIELDS.includes(sortByRaw)) {
    errors.sortBy = `sortBy must be one of: ${STORE_VALID_SORT_FIELDS.join(', ')}`;
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

  req.adminStoreQuery = {
    search,
    sortBy: STORE_ALLOWED_SORT_MAP[sortByRaw] || STORE_ALLOWED_SORT_MAP.created_at,
    sortOrder: sortOrderRaw || 'desc',
    page,
    limit,
  };

  next();
};

/**
 * Validates /:id path param for stores
 */
const validateStoreIdParam = (req, res, next) => {
  const rawId = req.params?.id;
  const n = Number(rawId);
  if (!rawId || !Number.isInteger(n) || n <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: { id: 'id must be a positive integer' },
    });
  }
  req.storeId = n;
  next();
};

module.exports = {
  validateCreateAdminUser,
  validateListUsersQuery,
  validateUserIdParam,
  validateCreateStore,
  validateListStoresQuery,
  validateStoreIdParam,
  VALID_ROLES,
  ALLOWED_SORT_MAP,
  VALID_SORT_ORDERS,
  STORE_VALID_SORT_FIELDS,
  STORE_ALLOWED_SORT_MAP,
};
