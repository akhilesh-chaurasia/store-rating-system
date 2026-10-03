/**
 * Automated Test Suite for Phase 5: Normal User Store Listing and Rating Management
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_not_for_prod';
}

const { authenticate } = require('../src/middleware/authMiddleware');
const { authorizeRoles } = require('../src/middleware/roleMiddleware');
const {
  validateStoreListQuery,
  validateStoreIdParam,
  validateRatingBody,
} = require('../src/validators/userStoreValidator');
const storeController = require('../src/controllers/storeController');
const ratingController = require('../src/controllers/ratingController');
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
  const users = [
    { id: 1, name: 'Normal User Alice 1234567890', role: 'USER' },
    { id: 2, name: 'Store Owner Bob 12345678901', role: 'OWNER' },
    { id: 3, name: 'Admin Charlie 123456789012', role: 'ADMIN' },
    { id: 4, name: 'Normal User Dave 12345678901', role: 'USER' },
  ];

  const stores = [
    {
      id: 1,
      name: 'Alpha Supermarket Store',
      address: '100 Main Market Road, Downtown',
      owner_id: 2,
    },
    {
      id: 2,
      name: 'Beta Electronics Hub Store',
      address: '200 Silicon Avenue, Tech Park',
      owner_id: 2,
    },
    {
      id: 3,
      name: 'Gamma Bookshop & Cafe Store',
      address: '300 Literary Lane, University Square',
      owner_id: 2,
    },
    {
      id: 4,
      name: 'Delta Fresh Produce Mart',
      address: '400 Farmer Market Boulevard',
      owner_id: 2,
    },
    {
      id: 5,
      name: 'Epsilon Empty Store Unrated',
      address: '500 Quiet Road, Deserted District',
      owner_id: 2,
    },
  ];

  // Ratings:
  // Store 1: User 1 rates 5, User 4 rates 3 -> AVG = 4.0
  // Store 2: User 4 rates 4 -> AVG = 4.0 (User 1 has not rated store 2)
  // Store 3: User 1 rates 2, User 4 rates 4 -> AVG = 3.0
  // Store 4: User 1 rates 1 -> AVG = 1.0
  // Store 5: No ratings -> AVG = 0
  let nextRatingId = 1;
  const ratings = [
    { id: nextRatingId++, user_id: 1, store_id: 1, rating: 5 },
    { id: nextRatingId++, user_id: 4, store_id: 1, rating: 3 },
    { id: nextRatingId++, user_id: 4, store_id: 2, rating: 4 },
    { id: nextRatingId++, user_id: 1, store_id: 3, rating: 2 },
    { id: nextRatingId++, user_id: 4, store_id: 3, rating: 4 },
    { id: nextRatingId++, user_id: 1, store_id: 4, rating: 1 },
  ];

  return { users, stores, ratings, getNextRatingId: () => nextRatingId++ };
}

let mockFixture = buildFixture();
const realExecute = pool.execute;

function installMock(fixture) {
  mockFixture = fixture;
  pool.execute = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // 1. SELECT COUNT(DISTINCT s.id) AS count FROM stores ...
    if (s.startsWith('SELECT COUNT(DISTINCT s.id) AS count FROM stores')) {
      let filtered = [...mockFixture.stores];
      if (s.includes('s.name LIKE ? OR s.address LIKE ?')) {
        const like = params[0].replace(/%/g, '').toLowerCase();
        filtered = filtered.filter(
          (st) => st.name.toLowerCase().includes(like) || st.address.toLowerCase().includes(like)
        );
      }
      return [[{ count: filtered.length }]];
    }

    // 2. Paginated stores with averageRating
    if (s.startsWith('SELECT s.id, s.name, s.address, COALESCE(AVG(r.rating), 0) AS averageRating FROM stores s')) {
      let filtered = [...mockFixture.stores];
      let paramIdx = 0;
      if (s.includes('s.name LIKE ? OR s.address LIKE ?')) {
        const like = params[paramIdx].replace(/%/g, '').toLowerCase();
        paramIdx += 2;
        filtered = filtered.filter(
          (st) => st.name.toLowerCase().includes(like) || st.address.toLowerCase().includes(like)
        );
      }

      // Compute average rating for each store
      const items = filtered.map((st) => {
        const storeRatings = mockFixture.ratings.filter((r) => r.store_id === st.id);
        const avg =
          storeRatings.length === 0
            ? 0
            : storeRatings.reduce((acc, r) => acc + r.rating, 0) / storeRatings.length;
        return {
          id: st.id,
          name: st.name,
          address: st.address,
          averageRating: avg,
        };
      });

      // Sort based on ORDER BY clause
      const isDesc = /ORDER BY .*?\bdesc\b/i.test(s);
      if (/ORDER BY .*?\baverageRating\b/i.test(s)) {
        items.sort((a, b) => (isDesc ? b.averageRating - a.averageRating : a.averageRating - b.averageRating));
      } else if (/ORDER BY .*?\bs\.address\b/i.test(s)) {
        items.sort((a, b) => (isDesc ? b.address.localeCompare(a.address) : a.address.localeCompare(b.address)));
      } else {
        // default name
        items.sort((a, b) => (isDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
      }

      const limit = Number(params[paramIdx]);
      const offset = Number(params[paramIdx + 1]);
      const pageRows = items.slice(offset, offset + limit);

      return [pageRows];
    }

    // 3. User ratings for stores on page: SELECT store_id, rating FROM ratings WHERE user_id = ? AND store_id IN (...)
    if (s.startsWith('SELECT store_id, rating FROM ratings WHERE user_id = ? AND store_id IN')) {
      const uId = Number(params[0]);
      const storeIds = params.slice(1).map(Number);
      const rows = mockFixture.ratings
        .filter((r) => r.user_id === uId && storeIds.includes(r.store_id))
        .map((r) => ({ store_id: r.store_id, rating: r.rating }));
      return [rows];
    }

    // 4. Store exists: SELECT id FROM stores WHERE id = ?
    if (s.startsWith('SELECT id FROM stores WHERE id = ?')) {
      const sId = Number(params[0]);
      const found = mockFixture.stores.find((st) => st.id === sId);
      return [found ? [{ id: found.id }] : []];
    }

    // 5. Existing rating check: SELECT id FROM ratings WHERE user_id = ? AND store_id = ?
    if (s.startsWith('SELECT id FROM ratings WHERE user_id = ? AND store_id = ?')) {
      const uId = Number(params[0]);
      const sId = Number(params[1]);
      const found = mockFixture.ratings.find((r) => r.user_id === uId && r.store_id === sId);
      return [found ? [{ id: found.id }] : []];
    }

    // 6. Insert rating: INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, ?)
    if (s.startsWith('INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, ?)')) {
      const uId = Number(params[0]);
      const sId = Number(params[1]);
      const rVal = Number(params[2]);

      // Check unique constraint simulation
      const duplicate = mockFixture.ratings.some((r) => r.user_id === uId && r.store_id === sId);
      if (duplicate) {
        const err = new Error("Duplicate entry for key 'uq_ratings_user_store'");
        err.code = 'ER_DUP_ENTRY';
        err.errno = 1062;
        throw err;
      }

      const newId = mockFixture.getNextRatingId();
      mockFixture.ratings.push({ id: newId, user_id: uId, store_id: sId, rating: rVal });
      return [{ insertId: newId, affectedRows: 1 }];
    }

    // 7. Update rating: UPDATE ratings SET rating = ? WHERE user_id = ? AND store_id = ?
    if (s.startsWith('UPDATE ratings SET rating = ? WHERE user_id = ? AND store_id = ?')) {
      const rVal = Number(params[0]);
      const uId = Number(params[1]);
      const sId = Number(params[2]);

      const found = mockFixture.ratings.find((r) => r.user_id === uId && r.store_id === sId);
      if (!found) {
        return [{ affectedRows: 0 }];
      }
      found.rating = rVal;
      return [{ affectedRows: 1 }];
    }

    return [[]];
  };
}

function restoreMock() {
  pool.execute = realExecute;
}

// Chain runner helper
async function runChain(reqOptions, { validationMw, handler }) {
  const { req, res, next } = mockRequestResponse(reqOptions);
  if (validationMw) {
    let mwDone = false;
    await validationMw(req, res, () => {
      mwDone = true;
    });
    if (!mwDone || res.statusCode !== 200) {
      return { req, res };
    }
  }
  await handler(req, res, next);
  return { req, res };
}

async function runTests() {
  console.log('===============================================================');
  console.log('    Phase 5: Normal User Stores & Ratings Test Suite           ');
  console.log('===============================================================\n');

  installMock(buildFixture());

  // -----------------------------------------------------------------
  // SUITE 1: RBAC & ROUTE ACCESS CONTROLS
  // -----------------------------------------------------------------
  console.log('[Suite 1/4] Role-Based Access Control (RBAC):');

  // 1. Unauthenticated store list -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '1. Store listing: unauthenticated request -> HTTP 401');
  }

  // 2. ADMIN accessing user store list -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '2. Store listing: ADMIN role -> HTTP 403 Access denied');
  }

  // 3. OWNER accessing user store list -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 2, role: 'OWNER' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '3. Store listing: OWNER role -> HTTP 403 Access denied');
  }

  // 4. USER role permitted on store list
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('USER')(req, res, next);
    assert(wasNextCalled(), '4. Store listing: USER role -> allowed');
  }

  // 5. Unauthenticated submit rating -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '5. Submit rating: unauthenticated request -> HTTP 401');
  }

  // 6. ADMIN on submit rating -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '6. Submit rating: ADMIN role -> HTTP 403 Access denied');
  }

  // 7. OWNER on submit rating -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 2, role: 'OWNER' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '7. Submit rating: OWNER role -> HTTP 403 Access denied');
  }

  // 8. Unauthenticated modify rating -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '8. Modify rating: unauthenticated request -> HTTP 401');
  }

  // 9. ADMIN on modify rating -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '9. Modify rating: ADMIN role -> HTTP 403 Access denied');
  }

  // 10. OWNER on modify rating -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 2, role: 'OWNER' } });
    authorizeRoles('USER')(req, res, next);
    assert(res.statusCode === 403, '10. Modify rating: OWNER role -> HTTP 403 Access denied');
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 2: STORE LISTING (GET /api/stores)
  // -----------------------------------------------------------------
  console.log('[Suite 2/4] Store Listing (GET /api/stores):');

  // 11. USER lists stores successfully
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const stores = res.jsonData?.data?.stores;
    assert(res.statusCode === 200 && Array.isArray(stores), '11. USER lists stores -> HTTP 200 with stores array');
  }

  // 12. Store listing fields returned
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const store1 = res.jsonData.data.stores.find((s) => s.id === 1);
    assert(
      store1 &&
        typeof store1.name === 'string' &&
        typeof store1.address === 'string' &&
        typeof store1.averageRating === 'number' &&
        store1.userRating !== undefined,
      '12. Store listing contains store name, address, averageRating, and userRating'
    );
  }

  // 13. Current user submitted rating is reflected correctly
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const store1 = res.jsonData.data.stores.find((s) => s.id === 1);
    assert(store1 && store1.userRating === 5, "13. Current user's submitted rating returned (store 1 userRating=5)");
  }

  // 14. Unrated store returns userRating = null
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const store2 = res.jsonData.data.stores.find((s) => s.id === 2);
    assert(store2 && store2.userRating === null, '14. Unrated store by current user returns userRating = null');
  }

  // 15. Store with no ratings returns averageRating = 0
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const store5 = res.jsonData.data.stores.find((s) => s.id === 5);
    assert(store5 && store5.averageRating === 0, '15. Store with no ratings returns averageRating = 0');
  }

  // 16. Search by store name
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { search: 'Electronics' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const stores = res.jsonData.data.stores;
    assert(
      stores.length === 1 && stores[0].id === 2,
      '16. Search by store name filters accurately (Electronics -> Beta Electronics)'
    );
  }

  // 17. Search by store address
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { search: 'Silicon Avenue' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const stores = res.jsonData.data.stores;
    assert(
      stores.length === 1 && stores[0].id === 2,
      '17. Search by store address filters accurately (Silicon Avenue -> Beta Electronics)'
    );
  }

  // 18. Ascending sort by name
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { sortBy: 'name', sortOrder: 'asc' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const names = res.jsonData.data.stores.map((s) => s.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert(JSON.stringify(names) === JSON.stringify(sorted), '18. Ascending sort by name orders correctly');
  }

  // 19. Descending sort by name
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { sortBy: 'name', sortOrder: 'desc' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const names = res.jsonData.data.stores.map((s) => s.name);
    const sorted = [...names].sort((a, b) => b.localeCompare(a));
    assert(JSON.stringify(names) === JSON.stringify(sorted), '19. Descending sort by name orders correctly');
  }

  // 20. Sort by average_rating desc
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { sortBy: 'average_rating', sortOrder: 'desc' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const avgs = res.jsonData.data.stores.map((s) => s.averageRating);
    const sorted = [...avgs].sort((a, b) => b - a);
    assert(JSON.stringify(avgs) === JSON.stringify(sorted), '20. Sort by average_rating desc orders highest first');
  }

  // 21. Pagination: page=1&limit=2 returns first 2 items + totals
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { page: '1', limit: '2' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const p = res.jsonData.data.pagination;
    assert(
      res.jsonData.data.stores.length === 2 && p.page === 1 && p.limit === 2 && p.total === 5 && p.totalPages === 3,
      '21. Pagination computes page, limit, total, and totalPages correctly'
    );
  }

  // 22. Invalid pagination (page=0, page=-1, limit=101, limit=abc)
  {
    const { res: r1 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { page: '0' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const { res: r2 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { page: '-1' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const { res: r3 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { limit: '101' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const { res: r4 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { limit: 'abc' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    assert(
      r1.statusCode === 400 && r2.statusCode === 400 && r3.statusCode === 400 && r4.statusCode === 400,
      '22. Invalid pagination parameters rejected with HTTP 400'
    );
  }

  // 23. Invalid sort (unknown sortBy or sortOrder)
  {
    const { res: r1 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { sortBy: 'hacked_column' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const { res: r2 } = await runChain(
      { user: { id: 1, role: 'USER' }, query: { sortOrder: 'sideways' } },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    assert(
      r1.statusCode === 400 && r2.statusCode === 400,
      '23. Invalid sort fields/orders rejected by whitelist with HTTP 400'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 3: SUBMIT RATING (POST /api/stores/:storeId/rating)
  // -----------------------------------------------------------------
  console.log('[Suite 3/4] Submit Rating (POST /api/stores/:storeId/rating):');

  // Reset fixture for mutation tests
  installMock(buildFixture());

  // 24. Rating 1 accepted
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '5' }, // User 1 has not rated store 5
        body: { rating: 1 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(res.statusCode === 201 && res.jsonData.data.rating === 1, '24. Rating 1 accepted -> HTTP 201');
  }

  // 25. Rating 5 accepted
  {
    const { res } = await runChain(
      {
        user: { id: 4, role: 'USER' },
        params: { storeId: '5' }, // User 4 has not rated store 5
        body: { rating: 5 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(res.statusCode === 201 && res.jsonData.data.rating === 5, '25. Rating 5 accepted -> HTTP 201');
  }

  // 26. Rating 0 rejected
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '2' },
        body: { rating: 0 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(res.statusCode === 400 && res.jsonData.errors.rating, '26. Rating 0 rejected -> HTTP 400');
  }

  // 27. Rating 6 rejected
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '2' },
        body: { rating: 6 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(res.statusCode === 400 && res.jsonData.errors.rating, '27. Rating 6 rejected -> HTTP 400');
  }

  // 28. Non-integer ratings rejected (float, string, missing, object)
  {
    const { res: rFloat } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '2' }, body: { rating: 3.5 } },
      { validationMw: validateRatingBody, handler: ratingController.submitRating }
    );
    const { res: rStr } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '2' }, body: { rating: '4' } },
      { validationMw: validateRatingBody, handler: ratingController.submitRating }
    );
    const { res: rMissing } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '2' }, body: {} },
      { validationMw: validateRatingBody, handler: ratingController.submitRating }
    );
    assert(
      rFloat.statusCode === 400 && rStr.statusCode === 400 && rMissing.statusCode === 400,
      '28. Non-integer ratings (float, string, missing) rejected -> HTTP 400'
    );
  }

  // 29. Nonexistent store -> 404
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '99999' },
        body: { rating: 4 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(res.statusCode === 404 && res.jsonData.message === 'Store not found', '29. Nonexistent store -> HTTP 404');
  }

  // 30. Invalid storeId parameter (0, negative, non-numeric)
  {
    const { res: rZero } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '0' }, body: { rating: 4 } },
      { validationMw: validateStoreIdParam, handler: ratingController.submitRating }
    );
    const { res: rNeg } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '-5' }, body: { rating: 4 } },
      { validationMw: validateStoreIdParam, handler: ratingController.submitRating }
    );
    const { res: rAlpha } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: 'abc' }, body: { rating: 4 } },
      { validationMw: validateStoreIdParam, handler: ratingController.submitRating }
    );
    assert(
      rZero.statusCode === 400 && rNeg.statusCode === 400 && rAlpha.statusCode === 400,
      '30. Invalid storeId parameters (0, negative, alpha) rejected with HTTP 400'
    );
  }

  // 31. Duplicate rating submission -> 409
  {
    // User 1 already rated store 1 in fixture
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '1' },
        body: { rating: 4 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.submitRating,
      }
    );
    assert(
      res.statusCode === 409 && res.jsonData.message === 'You have already rated this store',
      '31. Duplicate rating submission by same user for same store -> HTTP 409'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 4: MODIFY RATING (PATCH /api/stores/:storeId/rating) & DATA INTEGRITY
  // -----------------------------------------------------------------
  console.log('[Suite 4/4] Modify Rating & Data Integrity:');

  // Reset fixture for modification tests
  installMock(buildFixture());

  // 32. USER can modify existing rating
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '1' },
        body: { rating: 2 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.modifyRating,
      }
    );
    assert(
      res.statusCode === 200 && res.jsonData.message === 'Rating updated successfully',
      '32. USER modifies existing rating -> HTTP 200'
    );
  }

  // 33. Updated rating value verified in store
  {
    const updated = mockFixture.ratings.find((r) => r.user_id === 1 && r.store_id === 1);
    assert(updated && updated.rating === 2, '33. Updated rating value correctly saved as 2');
  }

  // 34. Modify rating when no rating exists for this store -> 404
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '2' }, // User 1 has not rated store 2
        body: { rating: 4 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.modifyRating,
      }
    );
    assert(
      res.statusCode === 404 && res.jsonData.message === 'No existing rating found for this store',
      '34. Modify rating without an existing rating -> HTTP 404'
    );
  }

  // 35. Modify rating on nonexistent store -> 404
  {
    const { res } = await runChain(
      {
        user: { id: 1, role: 'USER' },
        params: { storeId: '99999' },
        body: { rating: 4 },
      },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.modifyRating,
      }
    );
    assert(res.statusCode === 404 && res.jsonData.message === 'Store not found', '35. Modify rating on nonexistent store -> HTTP 404');
  }

  // 36. Invalid rating rejected on modify
  {
    const { res: r0 } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '1' }, body: { rating: 0 } },
      { validationMw: validateRatingBody, handler: ratingController.modifyRating }
    );
    const { res: r6 } = await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '1' }, body: { rating: 6 } },
      { validationMw: validateRatingBody, handler: ratingController.modifyRating }
    );
    assert(r0.statusCode === 400 && r6.statusCode === 400, '36. Invalid rating (0 or 6) on modify rejected with HTTP 400');
  }

  // 37. Average uses all ratings across users
  {
    // Fresh fixture: Store 1 has User 1 rating=5, User 4 rating=3 -> AVG = (5+3)/2 = 4.0
    installMock(buildFixture());
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const s1 = res.jsonData.data.stores.find((s) => s.id === 1);
    assert(s1 && s1.averageRating === 4, '37. Store average rating uses all ratings (5 + 3)/2 = 4.0');
  }

  // 38. Current user's rating does not distort the overall average
  {
    const { res } = await runChain(
      { user: { id: 1, role: 'USER' }, query: {} },
      { validationMw: validateStoreListQuery, handler: storeController.listStoresForUser }
    );
    const s1 = res.jsonData.data.stores.find((s) => s.id === 1);
    assert(
      s1 && s1.userRating === 5 && s1.averageRating === 4,
      "38. Current user's rating (5) is reported alongside true overall average (4) without distortion"
    );
  }

  // 39. User can modify ONLY own rating
  {
    // User 1 modifies rating on Store 1 to 1 star
    await runChain(
      { user: { id: 1, role: 'USER' }, params: { storeId: '1' }, body: { rating: 1 } },
      {
        validationMw: async (req, res, next) => {
          validateStoreIdParam(req, res, () => validateRatingBody(req, res, next));
        },
        handler: ratingController.modifyRating,
      }
    );
    const user4Rating = mockFixture.ratings.find((r) => r.user_id === 4 && r.store_id === 1);
    const user1Rating = mockFixture.ratings.find((r) => r.user_id === 1 && r.store_id === 1);
    assert(
      user1Rating && user1Rating.rating === 1 && user4Rating && user4Rating.rating === 3,
      "39. User 1 modification strictly affects User 1's rating, leaving User 4's rating intact at 3"
    );
  }

  // 40. Duplicate rating prevented by database unique constraint catch block
  {
    // Force direct DB-level conflict simulation
    let caught409 = false;
    const { req, res, next } = mockRequestResponse({
      user: { id: 1, role: 'USER' },
      storeId: 1,
      body: { rating: 4 },
    });
    // Call ratingController.submitRating where duplicate exists in fixture
    await ratingController.submitRating(req, res, next);
    if (res.statusCode === 409) {
      caught409 = true;
    }
    assert(caught409, '40. Duplicate rating prevented and returned as HTTP 409');
  }

  restoreMock();

  console.log('\n===============================================================');
  console.log(`   Phase 5 Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%) `);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    console.error('✗ Some Phase 5 tests failed. Review the output above.\n');
    process.exit(1);
  }

  console.log('✓ All Phase 5 Normal User Store & Rating Management tests PASSED!\n');
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
