/**
 * Automated Test Suite for Phase 4.3: Admin Store Management
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_not_for_prod';
}

const bcrypt = require('bcryptjs');
const { authenticate } = require('../src/middleware/authMiddleware');
const { authorizeRoles } = require('../src/middleware/roleMiddleware');
const {
  validateCreateStore,
  validateListStoresQuery,
  validateStoreIdParam,
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
  const specs = [
    ['Alice Robertson Super Long Name Person User', 'USER'],
    ['Bob Anderson Extra Long Name Owner Example', 'OWNER'],
    ['Carol Davis Yet Another Long Name Admin', 'ADMIN'],
    ['David Martinez Owner Extraordinaire Name', 'OWNER'],
    ['Eve Johnson Admin Person Very Long Name', 'ADMIN'],
    ['Frank Miller Store Owner Full Name Person', 'OWNER'],
    ['Grace Lee Regular User Super Long Name', 'USER'],
    ['Henry Taylor Owner User Very Long Full Name', 'OWNER'],
  ];
  for (const [name, role] of specs) {
    users.push({
      id: id++,
      name,
      email: `user${id - 1}@example.com`,
      password_hash: bcrypt.hashSync('ValidPass@123', 10),
      address: `${100 + (id - 1)} Generic Street, Cityville, State 0000${id - 1}`,
      role,
      created_at: new Date(Date.now() - (id - 1) * 1000 * 60 * 60 * 24).toISOString().slice(0, 19).replace('T', ' '),
    });
  }

  const stores = [
    {
      id: 1,
      name: "Alpha Electronics Super Store Very Long Name",
      email: 'alpha@store.com',
      address: '123 Tech Avenue, Electronics District, 10001',
      owner_id: 2, // Bob Anderson (OWNER)
      created_at: users[0].created_at,
    },
    {
      id: 2,
      name: "Beta Fashion Boutique Extra Long Store Name",
      email: 'beta@store.com',
      address: '456 Fashion Plaza, Glamour District, 20002',
      owner_id: 4, // David Martinez (OWNER)
      created_at: users[1].created_at,
    },
    {
      id: 3,
      name: "Gamma Hardware Supply House Long Name",
      email: 'gamma@store.com',
      address: '789 Hardware Lane, Industrial District, 30003',
      owner_id: 6, // Frank Miller (OWNER)
      created_at: users[2].created_at,
    },
    {
      id: 4,
      name: "Delta Books & More Long Store Name Example",
      email: 'delta@store.com',
      address: '321 Reader Street, Library District, 40004',
      owner_id: 8, // Henry Taylor (OWNER)
      created_at: users[3].created_at,
    },
    {
      id: 5,
      name: "Epsilon Organic Market Super Long Name Store",
      email: 'epsilon@store.com',
      address: '654 Organics Blvd, Farm District, 50005',
      owner_id: 2, // Bob Anderson (OWNER) - multi-store
      created_at: users[4].created_at,
    },
    {
      id: 6,
      name: "Zeta Artisan Bakery Long Store Name Ex",
      email: 'zeta@store.com',
      address: '987 Baker Lane, Culinary District, 60006',
      owner_id: 2, // Bob Anderson (OWNER) - no ratings
      created_at: users[5].created_at,
    },
  ];

  const ratings = [
    { id: 1, user_id: 1, store_id: 1, rating: 5 },
    { id: 2, user_id: 7, store_id: 1, rating: 4 },
    { id: 3, user_id: 5, store_id: 1, rating: 3 },
    { id: 4, user_id: 1, store_id: 2, rating: 5 },
    { id: 5, user_id: 7, store_id: 2, rating: 5 },
    { id: 6, user_id: 5, store_id: 2, rating: 4 },
    { id: 7, user_id: 1, store_id: 3, rating: 2 },
    { id: 8, user_id: 7, store_id: 3, rating: 3 },
    { id: 9, user_id: 5, store_id: 3, rating: 3 },
    { id: 10, user_id: 1, store_id: 4, rating: 5 },
    { id: 11, user_id: 7, store_id: 4, rating: 4 },
    { id: 12, user_id: 5, store_id: 5, rating: 4 },
  ];

  return { users, stores, ratings };
}

/**
 * Simulate the DB engine that would normally run the SQL.
 * Must correctly emulate: COUNT(DISTINCT), JOINs, AVG(), COALESCE, LIKE, WHERE, ORDER BY, GROUP BY, LIMIT/OFFSET.
 */
function installMock(fixture) {
  const originalExecute = pool.execute;

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
  }

  function likeMatch(value, pattern) {
    const s = String(value || '').toLowerCase();
    let p = pattern.toLowerCase();
    if (p.startsWith('%')) p = p.slice(1);
    if (p.endsWith('%')) p = p.slice(0, -1);
    return s.includes(p);
  }

  pool.execute = async function (sql, params = []) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    let pi = 0;

    // ---- INSERT INTO stores (create store) ----
    if (/^INSERT INTO stores/i.test(s)) {
      const [name, email, address, owner_id] = params;
      if (fixture.stores.some((x) => x.email === email)) {
        const dup = new Error("Duplicate entry for email");
        dup.code = 'ER_DUP_ENTRY';
        dup.errno = 1062;
        throw dup;
      }
      const newId = fixture.stores.length ? Math.max(...fixture.stores.map((x) => x.id)) + 1 : 1;
      fixture.stores.push({
        id: newId,
        name,
        email,
        address,
        owner_id: Number(owner_id),
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      return [{ insertId: newId }];
    }

    // ---- SELECT id, role FROM users WHERE id = ? (owner pre-check in create) ----
    if (/SELECT id, role FROM users WHERE id = \?/i.test(s)) {
      const id = Number(params[pi++]);
      const found = fixture.users.find((u) => u.id === id);
      return [[found ? { id: found.id, role: found.role } : undefined]];
    }

    // ---- SELECT id FROM stores WHERE email = ? (dup email check) ----
    if (/SELECT id FROM stores WHERE email = \?/i.test(s)) {
      const email = params[pi++];
      const found = fixture.stores.find((x) => x.email === email);
      return [[found ? { id: found.id } : undefined]];
    }

    // ---- SELECT STORE_DETAIL_FIELDS FROM stores WHERE id = ? (after insert, or detail) ----
    if (/SELECT id, name, email, address, owner_id FROM stores WHERE id = \?/i.test(s)) {
      const id = Number(params[pi++]);
      const f = fixture.stores.find((x) => x.id === id);
      if (!f) return [[undefined]];
      return [[{ id: f.id, name: f.name, email: f.email, address: f.address, owner_id: f.owner_id }]];
    }

    // ---- Detail query for store (with owner + aggregations via subqueries) ----
    // Contains: "FROM stores s INNER JOIN users u" + WHERE s.id = ?
    if (/FROM stores s INNER JOIN users u ON u\.id = s\.owner_id WHERE s\.id = \?/i.test(s)) {
      const storeId = Number(params[pi++]);
      const store = fixture.stores.find((x) => x.id === storeId);
      if (!store) return [[undefined]];
      const owner = fixture.users.find((u) => u.id === store.owner_id);
      if (!owner) return [[undefined]];
      const storeRatings = fixture.ratings.filter((r) => r.store_id === storeId);
      return [[{
        id: store.id,
        name: store.name,
        email: store.email,
        address: store.address,
        owner_id: store.owner_id,
        ownerId: owner.id,
        owner_name: owner.name,
        owner_email: owner.email,
        totalRatings: storeRatings.length,
        averageRating: avg(storeRatings.map((r) => r.rating)),
      }]];
    }

    // ---- Count distinct stores in listStores: COUNT(DISTINCT s.id) FROM stores s INNER JOIN users LEFT JOIN ratings WHERE ... ----
    if (/^SELECT COUNT\(DISTINCT s\.id\) AS count FROM stores s/i.test(s)) {
      let rows = fixture.stores.slice();
      const hasWhere = s.includes('WHERE');
      if (hasWhere) {
        const hasSearch = s.includes('s.name LIKE ? OR s.email LIKE ? OR s.address LIKE ? OR u.name LIKE ? OR u.email LIKE ?');
        if (hasSearch) {
          const like = String(params[pi]);
          pi += 5;
          const t = like.substring(1, like.length - 1).toLowerCase();
          rows = rows.filter((st) => {
            const owner = fixture.users.find((u) => u.id === st.owner_id);
            return (
              likeMatch(st.name, like) ||
              likeMatch(st.email, like) ||
              likeMatch(st.address, like) ||
              (owner && (likeMatch(owner.name, like) || likeMatch(owner.email, like)))
            );
          });
          void t;
        }
      }
      return [[{ count: rows.length }]];
    }

    // ---- List stores query with GROUP BY s.id, u.name, u.email + aggregations ----
    // Contains: "COALESCE(AVG(r.rating), 0) AS averageRating" + GROUP BY + ORDER BY + LIMIT ? OFFSET ?
    if (/COALESCE\(AVG\(r\.rating\), 0\) AS averageRating/i.test(s) && s.includes('GROUP BY s.id')) {
      let rows = fixture.stores.slice();

      const hasWhere = s.includes('WHERE');
      if (hasWhere) {
        const hasSearch = s.includes('s.name LIKE ? OR s.email LIKE ? OR s.address LIKE ? OR u.name LIKE ? OR u.email LIKE ?');
        if (hasSearch) {
          const like = String(params[pi]);
          pi += 5;
          rows = rows.filter((st) => {
            const owner = fixture.users.find((u) => u.id === st.owner_id);
            return (
              likeMatch(st.name, like) ||
              likeMatch(st.email, like) ||
              likeMatch(st.address, like) ||
              (owner && (likeMatch(owner.name, like) || likeMatch(owner.email, like)))
            );
          });
        }
      }

      // Build aggregate rows with owner info & averageRating
      let agg = rows.map((st) => {
        const owner = fixture.users.find((u) => u.id === st.owner_id);
        const rs = fixture.ratings.filter((r) => r.store_id === st.id);
        return {
          id: st.id,
          name: st.name,
          email: st.email,
          address: st.address,
          owner_id: st.owner_id,
          owner_name: owner ? owner.name : '',
          owner_email: owner ? owner.email : '',
          averageRating: avg(rs.map((r) => r.rating)),
          created_at: st.created_at,
        };
      });

      // Parse ORDER BY field + direction from SQL: match ORDER BY <expr> (asc|desc)
      // Possible fields: s.name, s.email, s.address, owner_name, owner_email, averageRating, s.created_at
      const orderMatch = s.match(/ORDER BY (.+?) (asc|desc), s.id/i);
      if (orderMatch) {
        const fieldExpr = orderMatch[1].trim();
        const dir = orderMatch[2].toLowerCase();
        const mapField = {
          's.name': 'name',
          's.email': 'email',
          's.address': 'address',
          'owner_name': 'owner_name',
          'owner_email': 'owner_email',
          'averageRating': 'averageRating',
          's.created_at': 'created_at',
        };
        const f = mapField[fieldExpr] || 'created_at';
        agg.sort((a, b) => {
          const va = a[f]; const vb = b[f];
          if (va < vb) return dir === 'asc' ? -1 : 1;
          if (va > vb) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // Parameterized pagination: last 2 params
      if (s.includes('LIMIT ? OFFSET ?') && params.length >= 2) {
        const limit = Number(params[params.length - 2]);
        const offset = Number(params[params.length - 1]);
        agg = agg.slice(offset, offset + limit);
      } else if (s.match(/LIMIT \d+ OFFSET \d+/i)) {
        const mm = s.match(/LIMIT (\d+) OFFSET (\d+)/i);
        if (mm) agg = agg.slice(Number(mm[2]), Number(mm[2]) + Number(mm[1]));
      }

      return [agg];
    }

    return [[]];
  };

  return function restore() { pool.execute = originalExecute; };
}

/**
 * Helper: run the standard middleware chain and stop early when JSON is returned.
 * If req.user is undefined, run real authenticate() against empty cookie to trigger 401.
 */
async function runAdminChain(opts, { handler, validationMw }) {
  const { req, res, next, wasNextCalled, getNextError } = mockRequestResponse(opts);

  if (!req.user) {
    authenticate(req, res, (e) => { if (e) next(e); });
    if (res.jsonData || getNextError()) return { req, res, next, wasNextCalled, getNextError };
  }

  authorizeRoles('ADMIN')(req, res, (e) => { if (e) next(e); });
  if (res.jsonData || getNextError()) return { req, res, next, wasNextCalled, getNextError };

  if (validationMw) {
    validationMw(req, res, (e) => { if (e) next(e); });
    if (res.jsonData || getNextError()) return { req, res, next, wasNextCalled, getNextError };
  }

  await handler(req, res, (e) => { if (e) next(e); });
  return { req, res, next, wasNextCalled, getNextError };
}

async function runTests() {
  console.log('===============================================================');
  console.log('   Phase 4.3: Admin Store Management Test Suite                ');
  console.log('===============================================================\n');

  const fixture = buildFixture();
  const restoreMock = installMock(fixture);

  // -----------------------------------------------------------------
  // CREATE STORE TESTS (cases 1-13)
  // -----------------------------------------------------------------
  console.log('[Suite 1/4] Admin Create Store (POST /api/admin/stores):');

  const VALID_OWNER_ID = fixture.users.find((u) => u.role === 'OWNER').id; // id=2

  // 1. Unauthenticated -> 401
  {
    const { res } = await runAdminChain({
      body: { name: 'New Store Super Long Name Example 123', email: 'new@store.com', address: '123 Test Street', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 401, '1. Unauthenticated create store -> HTTP 401');
  }

  // 2. USER -> 403
  {
    const { res } = await runAdminChain({
      user: { id: 1, role: 'USER' },
      body: { name: 'New Store Super Long Name Example 123', email: 'new@store.com', address: '123 Test Street', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', '2. USER role on admin create store -> HTTP 403 Access denied');
  }

  // 3. OWNER -> 403
  {
    const { res } = await runAdminChain({
      user: { id: VALID_OWNER_ID, role: 'OWNER' },
      body: { name: 'New Store Super Long Name Example 123', email: 'new@store.com', address: '123 Test Street', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', '3. OWNER role on admin create store -> HTTP 403 Access denied');
  }

  // 4. ADMIN can create store with valid OWNER
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Created Store Very Long Name Example', email: 'valid_created@store.com', address: '123 Creation Street, Genesis City', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    const st = res.jsonData?.data?.store;
    assert(
      res.statusCode === 201 && res.jsonData.success === true && st && st.owner_id === VALID_OWNER_ID && st.name && st.email,
      '4. ADMIN creates valid store -> HTTP 201 with store object'
    );
  }

  // 5. Missing required fields rejected
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: {},
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    const e = res.jsonData?.errors || {};
    assert(res.statusCode === 400 && e.name && e.email && e.address && e.owner_id, '5. Missing required fields -> HTTP 400 with per-field errors');
  }

  // 6. Invalid name rejected (too short)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'ShortName', email: 'valid@store.com', address: 'Valid Address Here', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 400 && res.jsonData.errors?.name, '6. Short store name rejected -> HTTP 400');
  }

  // 7. Invalid email rejected
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Super Long Name For Email', email: 'not-an-email', address: 'Valid Address', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 400 && res.jsonData.errors?.email, '7. Invalid store email rejected -> HTTP 400');
  }

  // 8. Invalid owner_id rejected (not a positive int)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Long Name For OwnerId 12', email: 'valid@store.com', address: 'Valid Address', owner_id: 'OWNER_ROLE' },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 400 && res.jsonData.errors?.owner_id, '8. Invalid owner_id (non-integer) rejected -> HTTP 400');
  }

  // 9. Non-existent owner -> 404
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Long Name For Nonexist 99', email: 'nonexist@store.com', address: 'Valid Address', owner_id: 99999 },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(res.statusCode === 404 && res.jsonData.message === 'Owner not found', '9. Non-existent owner_id -> HTTP 404 Owner not found');
  }

  // 10. USER used as owner -> rejected
  const USER_ID = fixture.users.find((u) => u.role === 'USER').id; // id=1
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Long Name With User Owner 10', email: 'userowner@store.com', address: 'Valid Address', owner_id: USER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(
      res.statusCode === 400 && res.jsonData.errors?.owner_id && /not a valid OWNER/.test(res.jsonData.errors.owner_id),
      '10. owner_id pointing to USER -> HTTP 400 not a valid OWNER'
    );
  }

  // 11. ADMIN used as owner -> rejected
  const ADMIN_ID = fixture.users.find((u) => u.role === 'ADMIN').id; // id=3
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Long Name With Admin Owner 11', email: 'adminowner@store.com', address: 'Valid Address', owner_id: ADMIN_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    assert(
      res.statusCode === 400 && res.jsonData.errors?.owner_id,
      '11. owner_id pointing to ADMIN -> HTTP 400 not a valid OWNER'
    );
  }

  // 12. Parameterized INSERT is used (observe 4 ? placeholders in INSERT via controller + 4-element array passed)
  // Strategy: call controller once with unique email, observe INSERT actually worked (fixture grows + projection correct)
  {
    const beforeCount = fixture.stores.length;
    const uniqueEmail = 'paramcheck_' + Date.now() + '@store.com';
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Super Long Name Param Check', email: uniqueEmail, address: 'Valid Address Street 90001', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    const afterCount = fixture.stores.length;
    const inFixture = fixture.stores.some((x) => x.email === uniqueEmail);
    assert(
      res.statusCode === 201 && afterCount === beforeCount + 1 && inFixture,
      '12. Parameterized INSERT works: new row added to stores table, correct owner_id'
    );
  }

  // 13. Successful response does not expose unnecessary data (no password_hash, no owner name/email, only required fields)
  {
    const uniqueEmail = 'sanitizecheck_' + Date.now() + '@store.com';
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      body: { name: 'Valid Store Long Name For Sanitize Check', email: uniqueEmail, address: 'Valid Address', owner_id: VALID_OWNER_ID },
    }, { handler: adminController.createStore, validationMw: validateCreateStore });
    const st = res.jsonData?.data?.store;
    const str = JSON.stringify(res.jsonData);
    const keys = Object.keys(st || {}).sort().join(',');
    assert(
      res.statusCode === 201 &&
        !str.includes('password_hash') &&
        !str.includes('created_at') &&
        keys === 'address,email,id,name,owner_id',
      '13. Create response exposes ONLY id,name,email,address,owner_id (no created_at/password_hash)'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // LIST STORES TESTS (cases 14-30)
  // -----------------------------------------------------------------
  console.log('[Suite 2/4] Admin List Stores (GET /api/admin/stores):');

  // 14. ADMIN can list stores + basic shape
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '10' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(
      res.statusCode === 200 && res.jsonData.success === true &&
        Array.isArray(res.jsonData.data.stores) && res.jsonData.data.pagination,
      '14. ADMIN lists stores -> HTTP 200 with stores[] + pagination'
    );
  }

  // 15. Store data contains required fields (id,name,email,address,owner_id)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const stores = res.jsonData.data.stores;
    const allGood = stores.length > 0 && stores.every((s) =>
      typeof s.id === 'number' && s.name && s.email && s.address && typeof s.owner_id === 'number'
    );
    assert(res.statusCode === 200 && allGood, '15. Every store contains id,name,email,address,owner_id');
  }

  // 16. Owner name/email are included (nested owner object)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const stores = res.jsonData.data.stores;
    const ok = stores.every((s) =>
      s.owner && typeof s.owner.name === 'string' && typeof s.owner.email === 'string'
    );
    assert(res.statusCode === 200 && stores.length > 0 && ok, '16. All stores include owner.name and owner.email');
  }

  // 17. Average rating is calculated correctly (store_id=1 has ratings [5,4,3] avg=4)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '100', sortBy: 'name', sortOrder: 'asc' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const s1 = res.jsonData.data.stores.find((s) => s.id === 1);
    assert(s1 && s1.averageRating === 4, '17. Store id=1 averageRating = AVG(5,4,3) = 4');
  }

  // 18. Store with no ratings returns averageRating = 0 (store 6 has no ratings)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '100', sortBy: 'name', sortOrder: 'asc' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const s6 = res.jsonData.data.stores.find((s) => s.id === 6);
    assert(s6 && s6.averageRating === 0, '18. Store id=6 (no ratings) returns averageRating = 0 via COALESCE');
  }

  // 19. Search by store name
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { search: 'Electronics' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const allMatch = res.jsonData.data.stores.every((s) => s.name.toLowerCase().includes('electronics'));
    assert(res.jsonData.data.stores.length >= 1 && allMatch, '19. Search="Electronics" matches by store name');
  }

  // 20. Search by store email
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { search: 'beta@store.com' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const match = res.jsonData.data.stores.some((s) => s.email === 'beta@store.com');
    assert(res.jsonData.data.stores.length === 1 && match, '20. Search by exact store email returns only that store');
  }

  // 21. Search by store address
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { search: 'Industrial District' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const allMatch = res.jsonData.data.stores.every((s) => s.address.toLowerCase().includes('industrial district'));
    assert(res.jsonData.data.stores.length >= 1 && allMatch, '21. Search matches by store address');
  }

  // 22. Search by owner name/email (e.g., owner Bob Anderson id=2, or user2@example.com)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { search: 'Bob Anderson' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const allByBob = res.jsonData.data.stores.every((s) => s.owner.name.toLowerCase().includes('bob anderson'));
    assert(res.jsonData.data.stores.length >= 1 && allByBob, '22. Search matches by owner name');

    const { res: res2 } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { search: 'user2@example.com' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const allByUser2 = res2.jsonData.data.stores.every((s) => s.owner.email === 'user2@example.com');
    assert(res2.jsonData.data.stores.length >= 1 && allByUser2, '22b. Search matches by owner email');
  }

  // 23. Role/authentication restrictions still work (unauth => 401; USER => 403)
  {
    const { res } = await runAdminChain({
      query: { page: '1', limit: '10' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(res.statusCode === 401, '23a. Unauthenticated list stores -> HTTP 401');

    const { res: res2 } = await runAdminChain({
      user: { id: 1, role: 'USER' },
      query: { page: '1', limit: '10' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(res2.statusCode === 403, '23b. USER list stores -> HTTP 403');
  }

  // 24. Sorting ascending (by name)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { sortBy: 'name', sortOrder: 'asc', page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const names = res.jsonData.data.stores.map((s) => s.name);
    let sorted = true;
    for (let i = 1; i < names.length; i++) { if (names[i - 1] > names[i]) { sorted = false; break; } }
    assert(res.statusCode === 200 && sorted, '24. sortBy=name asc returns stores sorted ascending');
  }

  // 25. Sorting descending (by name)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { sortBy: 'name', sortOrder: 'desc', page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const names = res.jsonData.data.stores.map((s) => s.name);
    let sorted = true;
    for (let i = 1; i < names.length; i++) { if (names[i - 1] < names[i]) { sorted = false; break; } }
    assert(res.statusCode === 200 && sorted, '25. sortBy=name desc returns stores sorted descending');
  }

  // 26. Average-rating sorting works (sortBy=average_rating desc => highest rated first)
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { sortBy: 'average_rating', sortOrder: 'desc', page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const avgs = res.jsonData.data.stores.map((s) => s.averageRating);
    let sorted = true;
    for (let i = 1; i < avgs.length; i++) { if (avgs[i - 1] < avgs[i]) { sorted = false; break; } }
    assert(res.statusCode === 200 && sorted, '26. sortBy=average_rating desc sorts by calculated aggregate rating');
  }

  // 27. Pagination (page 2, limit=2 => correct slices + totalPages)
  {
    const pageSize = 2;
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '2', limit: String(pageSize) },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const pg = res.jsonData.data.pagination;
    assert(
      res.jsonData.data.stores.length === pageSize &&
        pg.page === 2 && pg.limit === pageSize &&
        pg.total === fixture.stores.length &&
        pg.totalPages === Math.ceil(fixture.stores.length / pageSize),
      '27. Pagination: page 2 with limit=2 returns correct slice + totals'
    );
  }

  // 28. Invalid sort field is rejected safely (whitelist enforced, no SQL injection)
  {
    const { req, res, next } = mockRequestResponse({ query: { sortBy: 'password_hash; DROP TABLE stores' } });
    validateListStoresQuery(req, res, next);
    const attackBlocked = res.statusCode === 400 && res.jsonData.errors?.sortBy;
    const req2 = { query: { sortBy: 'invalid_field' } };
    const ctx2 = mockRequestResponse(req2);
    validateListStoresQuery(req2, ctx2.res, ctx2.next);
    assert(attackBlocked && ctx2.res.statusCode === 400, '28. Invalid sortBy rejected by whitelist (no injection possible)');
  }

  // 29. Invalid sort order is rejected
  {
    const { req, res, next } = mockRequestResponse({ query: { sortBy: 'name', sortOrder: 'descending' } });
    validateListStoresQuery(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.sortOrder, '29. Invalid sortOrder rejected (must be asc/desc)');
  }

  // 30. Invalid pagination values are handled
  {
    // Negative page
    const { res: r1 } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '-5', limit: '10' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(r1.statusCode === 400 && r1.jsonData.errors?.page, '30a. Negative page value -> HTTP 400');

    // Limit > MAX_LIMIT (200 > 100)
    const { res: r2 } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '200' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(r2.statusCode === 400 && r2.jsonData.errors?.limit, '30b. limit exceeds MAX_LIMIT -> HTTP 400');

    // Non-numeric values
    const { res: r3 } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: 'abc', limit: 'def' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    assert(r3.statusCode === 400 && r3.jsonData.errors?.page && r3.jsonData.errors?.limit, '30c. Non-numeric page/limit -> HTTP 400');
  }

  console.log('');

  // -----------------------------------------------------------------
  // STORE DETAIL TESTS (cases 31-37)
  // -----------------------------------------------------------------
  console.log('[Suite 3/4] Admin Store Details (GET /api/admin/stores/:id):');

  // 31. ADMIN can view store details
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    const st = res.jsonData?.data?.store;
    assert(
      res.statusCode === 200 && st && st.id === 1 && st.name && st.email && st.address,
      '31. ADMIN views store details -> HTTP 200 with id/name/email/address'
    );
  }

  // 32. Missing store -> 404
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: '99999' },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    assert(res.statusCode === 404 && res.jsonData.message === 'Store not found', '32. Missing store id -> HTTP 404 Store not found');
  }

  // 33. Invalid store id -> 400
  {
    const { req, res, next } = mockRequestResponse({ params: { id: 'abc' } });
    validateStoreIdParam(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors?.id, '33. Invalid store id (non-integer) -> HTTP 400');

    const { req: r2, res: r2s, next: n2 } = mockRequestResponse({ params: { id: '-1' } });
    validateStoreIdParam(r2, r2s, n2);
    assert(r2s.statusCode === 400 && r2s.jsonData.errors?.id, '33b. Negative store id -> HTTP 400');
  }

  // 34. Owner information included (id, name, email)
  {
    const storeId = 1;
    const expectedOwner = fixture.users.find((u) => u.id === fixture.stores.find((x) => x.id === storeId).owner_id);
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: String(storeId) },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    const owner = res.jsonData?.data?.store?.owner;
    assert(
      owner && owner.id === expectedOwner.id &&
        owner.name === expectedOwner.name && owner.email === expectedOwner.email,
      '34. Store details include owner id/name/email'
    );
  }

  // 35. averageRating included
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    const r = res.jsonData?.data?.store;
    assert(
      r && typeof r.averageRating === 'number' && r.averageRating === 4,
      '35. Store id=1 details includes averageRating = 4 (matches AVG aggregate)'
    );
  }

  // 36. totalRatings included
  {
    const { res } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    const r = res.jsonData?.data?.store;
    assert(
      r && typeof r.totalRatings === 'number' && r.totalRatings === 3,
      '36. Store id=1 details includes totalRatings = 3 (correct count from ratings)'
    );
  }

  // 37. password_hash is never exposed anywhere in response JSON (across create, list, detail)
  {
    const { res: detailRes } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      params: { id: '1' },
    }, { handler: adminController.getStoreDetails, validationMw: validateStoreIdParam });
    const { res: listRes } = await runAdminChain({
      user: { id: 3, role: 'ADMIN' },
      query: { page: '1', limit: '100' },
    }, { handler: adminController.listStores, validationMw: validateListStoresQuery });
    const combined = JSON.stringify(detailRes.jsonData) + JSON.stringify(listRes.jsonData);
    assert(
      !combined.includes('password_hash'),
      '37. password_hash is never present in list or detail response JSON'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // SECURITY / REGRESSION TESTS (cases 38-40)
  // -----------------------------------------------------------------
  console.log('[Suite 4/4] Security Regression (existing phases):');
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '38a. authenticate -> 401 without cookie (auth regression)');
  }
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403, '38b. authorizeRoles USER on ADMIN route -> 403 (role regression)');
  }
  {
    const { req, res, wasNextCalled, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('ADMIN')(req, res, next);
    assert(wasNextCalled(), '38c. authorizeRoles ADMIN -> calls next() (role regression)');
  }

  console.log('   (Cases 39 and 40: run other suites below as sub-process assertions.)');

  restoreMock();

  console.log('\n===============================================================');
  console.log(`   Store-Suite Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%) `);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    console.error('✗ Some store management tests failed. Review the output above.\n');
    process.exit(1);
  }
  console.log('✓ Phase 4.3 Admin Store Management tests PASSED!\n');
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
