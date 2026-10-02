/**
 * Automated Test Suite for Phase 4.2: Admin User Management
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_not_for_prod';
}

const bcrypt = require('bcryptjs');
const { authenticate } = require('../src/middleware/authMiddleware');
const { authorizeRoles } = require('../src/middleware/roleMiddleware');
const {
  validateCreateAdminUser,
  validateListUsersQuery,
  validateUserIdParam,
} = require('../src/validators/adminValidator');
const adminController = require('../src/controllers/adminController');
const { pool } = require('../src/config/db');

function mockRequestResponse(reqOptions = {}) {
  const req = {
    body: {},
    cookies: {},
    headers: {},
    params: {},
    query: {},
    ...reqOptions,
  };

  const res = {
    statusCode: 200,
    headers: {},
    cookieData: {},
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    cookie(name, val, options) {
      this.cookieData[name] = { val, options };
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err || null;
  };

  return { req, res, next, wasNextCalled: () => nextCalled, getNextError: () => nextError };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function buildFixture() {
  const users = [];
  let id = 1;
  const names = [
    'Alice Robertson Super Long Name Person',
    'Bob Anderson Extra Long Name Example',
    'Carol Davis Yet Another Long Name Here',
    'David Martinez Owner Extraordinaire Name',
    'Eve Johnson User With Long Full Name',
    'Frank Miller Admin Person Very Long Name',
    'Grace Lee Store Owner Full Name Person',
    'Henry Taylor Generic User Very Long Name',
    'Ivy Chen System Admin Real Long Name',
    'Jack Wilson Owner Long Name Person',
    'Karen Brown Regular User Super Long Name',
  ];
  const roles = ['USER', 'OWNER', 'ADMIN', 'OWNER', 'USER', 'ADMIN', 'OWNER', 'USER', 'ADMIN', 'OWNER', 'USER'];
  const addresses = [
    '123 Maple Street, Springfield, IL 62704',
    '456 Oak Avenue, Metropolis, NY 10001',
    '789 Pine Road, Gotham, NJ 07001',
    '321 Elm Lane, Star City, CA 90001',
    '654 Birch Boulevard, Central City, TX 75001',
    '987 Cedar Drive, Coast City, FL 33001',
    '147 Walnut Court, Bludhaven, PA 19001',
    '258 Chestnut Plaza, Keystone, OH 44001',
    '369 Spruce Hill, Fawcett, WA 98001',
    '753 Willow Way, Midway, OR 97001',
    '852 Aspen Alley, Smallville, KS 66001',
  ];
  for (let i = 0; i < names.length; i++) {
    users.push({
      id: id++,
      name: names[i],
      email: `user${i + 1}@example.com`,
      password_hash: bcrypt.hashSync('ValidPass@123', 10),
      address: addresses[i],
      role: roles[i],
      created_at: new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString().slice(0, 19).replace('T', ' '),
    });
  }
  const stores = [
    { id: 1, name: "Dave's Electronics Store", email: 'daves@store.com', address: '123 Store Ave', owner_id: 4 },
    { id: 2, name: "Grace's Fashion Boutique", email: 'graces@store.com', address: '456 Shop Rd', owner_id: 7 },
    { id: 3, name: "Jack's Hardware", email: 'jacks@store.com', address: '789 Market Ln', owner_id: 10 },
  ];
  const ratings = [
    { id: 1, user_id: 1, store_id: 1, rating: 5 },
    { id: 2, user_id: 2, store_id: 1, rating: 4 },
    { id: 3, user_id: 3, store_id: 1, rating: 3 },
    { id: 4, user_id: 5, store_id: 2, rating: 5 },
    { id: 5, user_id: 8, store_id: 2, rating: 4 },
    { id: 6, user_id: 11, store_id: 3, rating: 2 },
  ];
  return { users, stores, ratings };
}

function installMock(fixture) {
  const originalExecute = pool.execute;
  pool.execute = async function (sql, params = []) {
    const s = String(sql).trim();

    if (/^INSERT INTO users/i.test(s)) {
      const [name, email, password_hash, address, role] = params;
      if (fixture.users.some((u) => u.email === email)) {
        const dupError = new Error("Duplicate entry for key 'email'");
        dupError.code = 'ER_DUP_ENTRY';
        dupError.errno = 1062;
        throw dupError;
      }
      const newId = fixture.users.length ? Math.max(...fixture.users.map((u) => u.id)) + 1 : 1;
      fixture.users.push({
        id: newId,
        name,
        email,
        password_hash,
        address,
        role,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      return [{ insertId: newId }];
    }

    if (/SELECT id FROM users WHERE email = \?/i.test(s)) {
      const email = params[0];
      const found = fixture.users.filter((u) => u.email === email);
      return [found.map((u) => ({ id: u.id }))];
    }

    if (/SELECT id, name, email, address, role, created_at FROM users/i.test(s)) {
      const orderMatch = s.match(/ORDER BY (\w+) (asc|desc)/i);
      let rows = [...fixture.users];
      const whereIdx = s.indexOf('WHERE');
      if (whereIdx > 0) {
        let pIdx = 0;
        if (s.includes('name LIKE ? OR email LIKE ? OR address LIKE ?')) {
          const like = String(params[pIdx]);
          pIdx += 3;
          const t = like.substring(1, like.length - 1).toLowerCase();
          rows = rows.filter(
            (u) => u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t) || u.address.toLowerCase().includes(t)
          );
        }
        if (s.includes('role = ?')) {
          const r = params[pIdx++];
          rows = rows.filter((u) => u.role === r);
        }
      }
      if (orderMatch) {
        const field = orderMatch[1];
        const dir = orderMatch[2].toLowerCase();
        rows.sort((a, b) => {
          const va = a[field]; const vb = b[field];
          if (va < vb) return dir === 'asc' ? -1 : 1;
          if (va > vb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      let limitedRows = rows;
      // Parameterized pagination: LIMIT ? OFFSET ? => last 2 params
      if (s.includes('LIMIT ? OFFSET ?') && params.length >= 2) {
        const offset = Number(params[params.length - 1]);
        const limit = Number(params[params.length - 2]);
        if (!Number.isNaN(limit) && !Number.isNaN(offset)) {
          limitedRows = rows.slice(offset, offset + limit);
        }
      } else if (s.match(/LIMIT \d+ OFFSET \d+/i)) {
        const m = s.match(/LIMIT (\d+) OFFSET (\d+)/i);
        if (m) {
          const limit = Number(m[1]);
          const offset = Number(m[2]);
          limitedRows = rows.slice(offset, offset + limit);
        }
      }
      return [limitedRows.map((u) => ({ id: u.id, name: u.name, email: u.email, address: u.address, role: u.role, created_at: u.created_at }))];
    }

    if (/SELECT COUNT\(\*\) AS count FROM users WHERE/i.test(s)) {
      let rows = [...fixture.users];
      let pIdx = 0;
      if (s.includes('name LIKE ? OR email LIKE ? OR address LIKE ?')) {
        const like = String(params[pIdx]);
        pIdx += 3;
        const t = like.substring(1, like.length - 1).toLowerCase();
        rows = rows.filter(
          (u) => u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t) || u.address.toLowerCase().includes(t)
        );
      }
      if (s.includes('role = ?')) {
        const r = params[pIdx++];
        rows = rows.filter((u) => u.role === r);
      }
      return [[{ count: rows.length }]];
    }

    if (/SELECT COUNT\(\*\) AS count FROM users$/i.test(s)) return [[{ count: fixture.users.length }]];
    if (/SELECT COUNT\(\*\) AS count FROM stores$/i.test(s)) return [[{ count: fixture.stores.length }]];
    if (/SELECT COUNT\(\*\) AS count FROM ratings$/i.test(s)) return [[{ count: fixture.ratings.length }]];

    if (/SELECT id, name, email, address, role FROM users WHERE id = \?/i.test(s)) {
      const id = Number(params[0]);
      const found = fixture.users.find((u) => u.id === id);
      const projected = found
        ? { id: found.id, name: found.name, email: found.email, address: found.address, role: found.role }
        : null;
      return [[projected]];
    }

    if (/FROM stores WHERE owner_id = \?/i.test(s)) {
      const ownerId = Number(params[0]);
      return [fixture.stores.filter((st) => st.owner_id === ownerId)];
    }

    if (/FROM ratings WHERE store_id = \?/i.test(s)) {
      const storeId = Number(params[0]);
      const rs = fixture.ratings.filter((r) => r.store_id === storeId);
      const count = rs.length;
      const avg = count ? rs.reduce((a, r) => a + r.rating, 0) / count : 0;
      return [[{ totalRatings: count, averageRating: avg }]];
    }

    if (/INNER JOIN stores s ON s.id = r.store_id\s+WHERE s.owner_id = \?/i.test(s)) {
      const ownerId = Number(params[0]);
      const storeIds = fixture.stores.filter((st) => st.owner_id === ownerId).map((st) => st.id);
      const rs = fixture.ratings.filter((r) => storeIds.includes(r.store_id));
      const count = rs.length;
      const avg = count ? rs.reduce((a, r) => a + r.rating, 0) / count : 0;
      return [[{ totalRatings: count, averageRating: avg }]];
    }

    return [[]];
  };
  return function restore() { pool.execute = originalExecute; };
}

async function runTests() {
  console.log('===============================================================');
  console.log('   Phase 4.2: Admin User Management Test Suite                 ');
  console.log('===============================================================\n');

  const fixture = buildFixture();
  const restoreMock = installMock(fixture);

  // -----------------------------------------------------------------
  // CREATE USER TESTS (cases 1-13)
  // -----------------------------------------------------------------
  console.log('[Suite 1/4] Admin Create User (POST /api/admin/users):');

  // 1. Unauthenticated -> 401 (authenticate middleware)
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '1. Unauthenticated request to create user -> HTTP 401');
  }

  // 2. USER -> 403 (authorizeRoles('ADMIN') middleware)
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', '2. USER role on admin create endpoint -> HTTP 403 Access denied');
  }

  // 3. OWNER -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'OWNER' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', '3. OWNER role on admin create endpoint -> HTTP 403 Access denied');
  }

  const validName = 'Valid Created User Very Long Full Name Example';
  const validAddress = '42 Creation Avenue, Genesis City, 00001';

  // Helper: run the full middleware->handler chain synchronously until handler resolves,
  // stopping early if any middleware returns a JSON response.
  async function runAdminChain(opts, { handler, validationMw } = {}) {
    const { req, res, next, wasNextCalled, getNextError } = mockRequestResponse(opts);

    // Step 1: authenticate (simulate pass-through since we inject req.user directly)
    // (When role is undefined, we instead want it to fail via real authenticate())
    let stopped = false;
    const checkStop = () => !!res.jsonData || !!getNextError();

    if (!req.user) {
      authenticate(req, res, (e) => { if (e) next(e); });
      if (checkStop()) return { req, res, next, wasNextCalled, getNextError };
    }

    // Step 2: authorizeRoles('ADMIN')
    authorizeRoles('ADMIN')(req, res, (e) => { if (e) next(e); });
    if (checkStop()) return { req, res, next, wasNextCalled, getNextError };

    // Step 3: validation middleware (if provided)
    if (validationMw) {
      validationMw(req, res, (e) => { if (e) next(e); });
      if (checkStop()) return { req, res, next, wasNextCalled, getNextError };
    }

    // Step 4: controller handler
    await handler(req, res, (e) => { if (e) next(e); });
    return { req, res, next, wasNextCalled, getNextError };
  }

  // 4. ADMIN can create USER
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: validName, email: 'created_user@example.com', address: validAddress, password: 'ValidPass@123', role: 'USER' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    const u = res.jsonData?.data?.user;
    assert(res.statusCode === 201 && res.jsonData.success === true && u && u.role === 'USER', '4. ADMIN creates USER -> HTTP 201 with role=USER');
  }

  // 5. ADMIN can create ADMIN
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: 'Created Admin User Very Long Full Name', email: 'created_admin@example.com', address: validAddress, password: 'ValidPass@123', role: 'ADMIN' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    const u = res.jsonData?.data?.user;
    assert(res.statusCode === 201 && u && u.role === 'ADMIN', '5. ADMIN creates ADMIN -> HTTP 201 with role=ADMIN');
  }

  // 6. ADMIN can create OWNER
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: 'Created Owner User Very Long Full Name', email: 'created_owner@example.com', address: validAddress, password: 'ValidPass@123', role: 'OWNER' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    const u = res.jsonData?.data?.user;
    assert(res.statusCode === 201 && u && u.role === 'OWNER', '6. ADMIN creates OWNER -> HTTP 201 with role=OWNER');
  }

  // 7. Invalid name rejected (too short)
  {
    const { req, res, next } = mockRequestResponse({
      body: { name: 'Short', email: 'a@example.com', address: validAddress, password: 'ValidPass@123', role: 'USER' },
    });
    validateCreateAdminUser(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.name, '7. Short name rejected with HTTP 400');
  }

  // 8. Invalid email rejected
  {
    const { req, res, next } = mockRequestResponse({
      body: { name: validName, email: 'not-an-email', address: validAddress, password: 'ValidPass@123', role: 'USER' },
    });
    validateCreateAdminUser(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.email, '8. Invalid email rejected with HTTP 400');
  }

  // 9. Invalid password rejected (no uppercase)
  {
    const { req, res, next } = mockRequestResponse({
      body: { name: validName, email: 'a@example.com', address: validAddress, password: 'weakpass@1', role: 'USER' },
    });
    validateCreateAdminUser(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.password, '9. Weak password rejected with HTTP 400');
  }

  // 10. Invalid role rejected
  {
    const { req, res, next } = mockRequestResponse({
      body: { name: validName, email: 'a@example.com', address: validAddress, password: 'ValidPass@123', role: 'SUPER_ADMIN' },
    });
    validateCreateAdminUser(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.role, '10. Invalid role rejected with HTTP 400');
  }

  // 11. Duplicate email -> 409 (via controller)
  {
    const existing = fixture.users[0].email;
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: validName, email: existing, address: validAddress, password: 'ValidPass@123', role: 'USER' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    assert(res.statusCode === 409 && res.jsonData.message === 'Email is already registered', '11. Duplicate email -> HTTP 409');
  }

  // 12. Password is hashed (inspect fixture)
  {
    const uniqueEmail = 'hashcheck@example.com';
    await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: validName, email: uniqueEmail, address: validAddress, password: 'ValidPass@123', role: 'USER' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    const createdUser = fixture.users.find((u) => u.email === uniqueEmail);
    const hashOk = createdUser && createdUser.password_hash && createdUser.password_hash.startsWith('$2');
    const compareOk = hashOk && (await bcrypt.compare('ValidPass@123', createdUser.password_hash));
    assert(Boolean(hashOk && compareOk), '12. Password stored as bcrypt hash and verifies against original');
  }

  // 13. password_hash never returned
  {
    const uniqueEmail = 'nohash@example.com';
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      body: { name: validName, email: uniqueEmail, address: validAddress, password: 'ValidPass@123', role: 'ADMIN' },
    }, { handler: adminController.createUser, validationMw: validateCreateAdminUser });
    const jsonStr = JSON.stringify(res.jsonData);
    assert(!jsonStr.includes('password_hash'), '13. password_hash is never present in create response JSON');
  }

  console.log('');

  // -----------------------------------------------------------------
  // LIST USERS TESTS (cases 14-22)
  // -----------------------------------------------------------------
  console.log('[Suite 2/4] Admin List Users (GET /api/admin/users):');

  // 14. ADMIN can list users + pagination
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { page: '1', limit: '5' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    assert(
      res.statusCode === 200 &&
        res.jsonData.success === true &&
        Array.isArray(res.jsonData.data.users) &&
        res.jsonData.data.pagination &&
        typeof res.jsonData.data.pagination.totalPages === 'number',
      '14. ADMIN lists users -> 200 with users[] and pagination block'
    );
  }

  // 22 (early): password_hash never returned in list
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { page: '1', limit: '100' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    assert(!JSON.stringify(res.jsonData).includes('password_hash'), '22. password_hash is never present in list response JSON');
  }

  // 15. Search by name/email/address
  {
    const term = 'Alice Robertson';
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { search: term, page: '1', limit: '20' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    const list = res.jsonData.data.users;
    const filteredOk = list.length >= 1 && list.every((u) =>
      u.name.toLowerCase().includes(term.toLowerCase()) ||
      u.email.toLowerCase().includes(term.toLowerCase()) ||
      u.address.toLowerCase().includes(term.toLowerCase())
    );
    assert(res.statusCode === 200 && filteredOk, '15. Search by name/email/address filters correctly');
  }

  // 16. Role filter
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { role: 'OWNER', page: '1', limit: '20' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    const list = res.jsonData.data.users;
    const allOwners = list.length > 0 && list.every((u) => u.role === 'OWNER');
    const expectedTotal = fixture.users.filter((u) => u.role === 'OWNER').length;
    const totalMatches = res.jsonData.data.pagination.total === expectedTotal;
    assert(res.statusCode === 200 && allOwners && totalMatches, '16. Role=OWNER filter returns only OWNERs with correct total');
  }

  // 17. Sorting ascending
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { sortBy: 'name', sortOrder: 'asc', page: '1', limit: '100' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    const names = res.jsonData.data.users.map((u) => u.name);
    let sorted = true;
    for (let i = 1; i < names.length; i++) { if (names[i - 1] > names[i]) { sorted = false; break; } }
    assert(res.statusCode === 200 && sorted, '17. sortBy=name asc returns users in ascending order');
  }

  // 18. Sorting descending
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { sortBy: 'name', sortOrder: 'desc', page: '1', limit: '100' },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    const names = res.jsonData.data.users.map((u) => u.name);
    let sorted = true;
    for (let i = 1; i < names.length; i++) { if (names[i - 1] < names[i]) { sorted = false; break; } }
    assert(res.statusCode === 200 && sorted, '18. sortBy=name desc returns users in descending order');
  }

  // 19. Pagination
  {
    const pageSize = 3;
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      query: { page: '2', limit: String(pageSize) },
    }, { handler: adminController.listUsers, validationMw: validateListUsersQuery });
    const pg = res.jsonData.data.pagination;
    assert(
      res.jsonData.data.users.length === pageSize &&
        pg.page === 2 && pg.limit === pageSize &&
        pg.total === fixture.users.length &&
        pg.totalPages === Math.ceil(fixture.users.length / pageSize),
      '19. Pagination: page 2 has 3 users, total/totalPages computed correctly'
    );
  }

  // 20. Invalid role handled
  {
    const { req, res, next } = mockRequestResponse({ query: { role: 'NOT_A_ROLE' } });
    validateListUsersQuery(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.role, '20. Invalid role filter -> HTTP 400');
  }

  // 21. Invalid sort field cannot be injected (whitelist enforced)
  {
    const { req, res, next } = mockRequestResponse({ query: { sortBy: 'password_hash; DROP TABLE users' } });
    validateListUsersQuery(req, res, next);
    const attackBlocked = res.statusCode === 400 && res.jsonData.errors?.sortBy;
    // Confirm validator doesn't set adminQuery for bad field
    const req2 = { query: { sortBy: 'password_hash' } };
    const ctx2 = mockRequestResponse(req2);
    validateListUsersQuery(req2, ctx2.res, ctx2.next);
    assert(attackBlocked && ctx2.res.statusCode === 400, '21. Invalid sortBy rejected by whitelist (SQL injection not possible)');
  }

  console.log('');

  // -----------------------------------------------------------------
  // DETAIL USER TESTS (cases 23-26)
  // -----------------------------------------------------------------
  console.log('[Suite 3/4] Admin User Details (GET /api/admin/users/:id):');

  // 23. ADMIN can view user details
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getUserDetails, validationMw: validateUserIdParam });
    const u = res.jsonData?.data?.user;
    assert(
      res.statusCode === 200 && u && u.id === 1 && u.name && u.email && u.role,
      '23. ADMIN views user details -> HTTP 200 with id/name/email/role'
    );
  }

  // 24. Missing user -> 404
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      params: { id: '99999' },
    }, { handler: adminController.getUserDetails, validationMw: validateUserIdParam });
    assert(res.statusCode === 404 && res.jsonData.message === 'User not found', '24. Missing user -> HTTP 404');
  }

  // 25. OWNER details include stores + rating aggregates
  {
    const owner = fixture.users.find((u) => u.role === 'OWNER' && fixture.stores.some((s) => s.owner_id === u.id));
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      params: { id: String(owner.id) },
    }, { handler: adminController.getUserDetails, validationMw: validateUserIdParam });
    const u = res.jsonData?.data?.user;
    const hasStores = Array.isArray(u?.stores) && u.stores.length > 0;
    const hasSummary = u?.ownerSummary &&
      typeof u.ownerSummary.totalStores === 'number' &&
      typeof u.ownerSummary.totalRatings === 'number' &&
      typeof u.ownerSummary.averageRating === 'number';
    const perStore = hasStores && u.stores.every((s) =>
      typeof s.totalRatings === 'number' && typeof s.averageRating === 'number'
    );
    assert(res.statusCode === 200 && hasStores && hasSummary && perStore, '25. OWNER details include stores[], per-store ratings, and ownerSummary');
  }

  // 26. password_hash never returned in detail response
  {
    const { res } = await runAdminChain({
      user: { id: 99, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getUserDetails, validationMw: validateUserIdParam });
    assert(!JSON.stringify(res.jsonData).includes('password_hash'), '26. password_hash is never present in detail response JSON');
  }

  console.log('');

  // -----------------------------------------------------------------
  // 27. SECURITY / REGRESSION: Phase 3 middleware unmodified behavior
  // -----------------------------------------------------------------
  console.log('[Suite 4/4] Security Regression (Phase 3 middleware):');
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '27a. authenticate() returns 401 without cookie (regression)');
  }
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', '27b. authorizeRoles(ADMIN) returns 403 for USER role (regression)');
  }
  {
    const { req, res, wasNextCalled, next } = mockRequestResponse({ user: { id: 1, role: 'ADMIN' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(wasNextCalled(), '27c. authorizeRoles(ADMIN) calls next() for ADMIN role (regression)');
  }

  restoreMock();

  console.log('\n===============================================================');
  console.log(`   Test Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%) `);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    console.log('✓ All Phase 4.2 Admin User Management tests PASSED!\n');
  } else {
    console.error('✗ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
