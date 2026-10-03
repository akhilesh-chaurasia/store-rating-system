/**
 * Automated Test Suite for Phase 6: Store Owner Backend
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_not_for_prod';
}

const { authenticate } = require('../src/middleware/authMiddleware');
const { authorizeRoles } = require('../src/middleware/roleMiddleware');
const { validateOwnerRatingsQuery } = require('../src/validators/ownerValidator');
const ownerController = require('../src/controllers/ownerController');
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
    { id: 1, name: 'Normal User Alice 1234567890', email: 'alice@example.com', address: '101 Alice Way', role: 'USER' },
    { id: 2, name: 'Store Owner Bob 12345678901', email: 'bob@example.com', address: '202 Bob Boulevard', role: 'OWNER' },
    { id: 3, name: 'Admin Charlie 123456789012', email: 'charlie@example.com', address: '303 Admin Avenue', role: 'ADMIN' },
    { id: 4, name: 'Store Owner Dave 12345678901', email: 'dave@example.com', address: '404 Dave Drive', role: 'OWNER' },
    { id: 5, name: 'Store Owner Eve Unassigned', email: 'eve@example.com', address: '505 Eve Road', role: 'OWNER' }, // No store
    { id: 6, name: 'Normal User Frank 1234567890', email: 'frank@example.com', address: '606 Frank Street', role: 'USER' },
    { id: 7, name: 'Normal User Grace 1234567890', email: 'grace@example.com', address: '707 Grace Court', role: 'USER' },
  ];

  const stores = [
    {
      id: 1,
      name: 'Alpha Supermarket Store',
      email: 'alpha@store.com',
      address: '100 Main Market Road, Downtown',
      owner_id: 2, // Bob
    },
    {
      id: 2,
      name: 'Beta Electronics Hub Store',
      email: 'beta@store.com',
      address: '200 Silicon Avenue, Tech Park',
      owner_id: 4, // Dave
    },
    {
      id: 3,
      name: 'Gamma Empty Mart Store',
      email: 'gamma@store.com',
      address: '300 Empty Road, Quiet Suburb',
      owner_id: 2, // Bob also owns Store 3 (unrated)
    },
  ];

  // Ratings:
  // Store 1 (Bob):
  //   - Alice (id 1) -> 5
  //   - Frank (id 6) -> 4
  //   - Grace (id 7) -> 3
  //   Total = 3, Avg = (5+4+3)/3 = 4.00
  // Store 2 (Dave):
  //   - Alice (id 1) -> 4
  //   - Frank (id 6) -> 5
  //   - Grace (id 7) -> 4
  //   Total = 3, Avg = (4+5+4)/3 = 4.33
  // Store 3 (Bob):
  //   - No ratings (Total = 0, Avg = 0)
  const ratings = [
    { id: 1, user_id: 1, store_id: 1, rating: 5, created_at: '2026-03-01 10:00:00' },
    { id: 2, user_id: 6, store_id: 1, rating: 4, created_at: '2026-03-02 11:00:00' },
    { id: 3, user_id: 7, store_id: 1, rating: 3, created_at: '2026-03-03 12:00:00' },
    { id: 4, user_id: 1, store_id: 2, rating: 4, created_at: '2026-03-04 13:00:00' },
    { id: 5, user_id: 6, store_id: 2, rating: 5, created_at: '2026-03-05 14:00:00' },
    { id: 6, user_id: 7, store_id: 2, rating: 4, created_at: '2026-03-06 15:00:00' },
  ];

  return { users, stores, ratings };
}

let mockFixture = buildFixture();
const realExecute = pool.execute;

function installMock(fixture) {
  mockFixture = fixture;
  pool.execute = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // 1. Fetch store by owner_id: SELECT ... FROM stores WHERE owner_id = ?
    if (s.startsWith('SELECT id, name, email, address, owner_id FROM stores WHERE owner_id = ?')) {
      const ownerId = Number(params[0]);
      const found = mockFixture.stores.filter((st) => st.owner_id === ownerId);
      // ORDER BY id ASC LIMIT 1
      found.sort((a, b) => a.id - b.id);
      return [found.slice(0, 1)];
    }

    // 2. Aggregate count & average: SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating FROM ratings WHERE store_id = ?
    if (s.startsWith('SELECT COUNT(*) AS totalRatings, COALESCE(AVG(rating), 0) AS averageRating FROM ratings WHERE store_id = ?')) {
      const storeId = Number(params[0]);
      const storeRatings = mockFixture.ratings.filter((r) => r.store_id === storeId);
      const count = storeRatings.length;
      const avg = count === 0 ? 0 : storeRatings.reduce((acc, r) => acc + r.rating, 0) / count;
      return [[{ totalRatings: count, averageRating: avg }]];
    }

    // 3. Ratings list for store: SELECT r.id AS ratingId, r.user_id AS userId, u.name AS userName...
    if (s.includes('FROM ratings r') && s.includes('INNER JOIN users u ON u.id = r.user_id') && s.includes('WHERE r.store_id = ?')) {
      const storeId = Number(params[0]);
      const storeRatings = mockFixture.ratings.filter((r) => r.store_id === storeId);

      const items = storeRatings.map((r) => {
        const u = mockFixture.users.find((usr) => usr.id === r.user_id);
        return {
          ratingId: r.id,
          userId: r.user_id,
          userName: u ? u.name : 'Unknown User',
          userEmail: u ? u.email : 'unknown@example.com',
          userAddress: u ? u.address : 'Unknown Address',
          rating: r.rating,
          createdAt: r.created_at,
        };
      });

      // Check sorting if ORDER BY is present
      const isDesc = /ORDER BY .*?\bdesc\b/i.test(s);
      if (/ORDER BY .*?\bu\.name\b/i.test(s)) {
        items.sort((a, b) => (isDesc ? b.userName.localeCompare(a.userName) : a.userName.localeCompare(b.userName)));
      } else if (/ORDER BY .*?\bu\.email\b/i.test(s)) {
        items.sort((a, b) => (isDesc ? b.userEmail.localeCompare(a.userEmail) : a.userEmail.localeCompare(b.userEmail)));
      } else if (/ORDER BY .*?\br\.rating\b/i.test(s)) {
        items.sort((a, b) => (isDesc ? b.rating - a.rating : a.rating - b.rating));
      } else {
        // default created_at
        items.sort((a, b) => (isDesc ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
      }

      // Check pagination LIMIT / OFFSET
      if (s.includes('LIMIT ? OFFSET ?')) {
        const limit = Number(params[1]);
        const offset = Number(params[2]);
        return [items.slice(offset, offset + limit)];
      }

      return [items];
    }

    return [[]];
  };
}

function restoreMock() {
  pool.execute = realExecute;
}

// Helper to run chain
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
  console.log('    Phase 6: Store Owner Backend Comprehensive Test Suite      ');
  console.log('===============================================================\n');

  installMock(buildFixture());

  // -----------------------------------------------------------------
  // SUITE 1: AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
  // -----------------------------------------------------------------
  console.log('[Suite 1/5] Authentication & Role-Based Access Control (RBAC):');

  // 1. Unauthenticated dashboard -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '1. Dashboard: unauthenticated request -> HTTP 401');
  }

  // 2. USER role -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('OWNER')(req, res, next);
    assert(res.statusCode === 403, '2. Dashboard: USER role -> HTTP 403 Access denied');
  }

  // 3. ADMIN role -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('OWNER')(req, res, next);
    assert(res.statusCode === 403, '3. Dashboard: ADMIN role -> HTTP 403 Access denied');
  }

  // 4. OWNER role -> allowed
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({ user: { id: 2, role: 'OWNER' } });
    authorizeRoles('OWNER')(req, res, next);
    assert(wasNextCalled(), '4. Dashboard: OWNER role -> allowed');
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 2: OWNER ISOLATION & SECURITY
  // -----------------------------------------------------------------
  console.log('[Suite 2/5] Owner Isolation & Store Security:');

  // 5. OWNER A (id=2) sees Store A (Alpha)
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.statusCode === 200 && res.jsonData.data.store.id === 1 && res.jsonData.data.store.name === 'Alpha Supermarket Store',
      '5. OWNER A (id=2) correctly accesses Store A (id=1, Alpha)'
    );
  }

  // 6. OWNER A does NOT see Store B
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.jsonData.data.store.id !== 2,
      '6. OWNER A does not receive Store B data'
    );
  }

  // 7. OWNER B (id=4) sees Store B (Beta)
  {
    const { res } = await runChain(
      { user: { id: 4, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.statusCode === 200 && res.jsonData.data.store.id === 2 && res.jsonData.data.store.name === 'Beta Electronics Hub Store',
      '7. OWNER B (id=4) correctly accesses Store B (id=2, Beta)'
    );
  }

  // 8. Client cannot override owner identity via query or body
  {
    const { res } = await runChain(
      {
        user: { id: 2, role: 'OWNER' },
        query: { ownerId: 4, storeId: 2 },
        body: { ownerId: 4, storeId: 2 },
      },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.statusCode === 200 && res.jsonData.data.store.id === 1,
      '8. Client query/body ownerId override ignored; identity derived strictly from req.user.id'
    );
  }

  // 9. Client cannot access another owner\'s ratings through arbitrary store ID
  {
    const { res } = await runChain(
      {
        user: { id: 2, role: 'OWNER' },
        query: { storeId: 2 },
      },
      { handler: ownerController.getOwnerDashboard }
    );
    const storeIdsInRatings = res.jsonData.data.ratings;
    assert(
      res.jsonData.data.store.id === 1,
      "9. Client cannot hijack another owner's store or ratings by supplying storeId parameter"
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 3: DASHBOARD DATA & ACCURACY
  // -----------------------------------------------------------------
  console.log('[Suite 3/5] Dashboard Data & Structure:');

  // 10. Correct store name
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.store.name === 'Alpha Supermarket Store', '10. Response contains correct store name');
  }

  // 11. Correct store address
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.store.address === '100 Main Market Road, Downtown', '11. Response contains correct store address');
  }

  // 12. Correct store ID
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.store.id === 1, '12. Response contains correct store ID');
  }

  // 13. Correct store email
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.store.email === 'alpha@store.com', '13. Response contains correct store email');
  }

  // 14. Correct average rating numeric
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(typeof res.jsonData.data.averageRating === 'number' && res.jsonData.data.averageRating === 4, '14. Response contains correct averageRating (4.00)');
  }

  // 15. Correct total rating count numeric
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(typeof res.jsonData.data.totalRatings === 'number' && res.jsonData.data.totalRatings === 3, '15. Response contains correct totalRatings (3)');
  }

  // 16. Ratings list returned as array
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(Array.isArray(res.jsonData.data.ratings) && res.jsonData.data.ratings.length === 3, '16. Response contains ratings array with 3 reviews');
  }

  // 17. Correct user name
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const aliceRating = res.jsonData.data.ratings.find((r) => r.userId === 1);
    assert(aliceRating && aliceRating.userName === 'Normal User Alice 1234567890', '17. Rating entry contains correct user name');
  }

  // 18. Correct user email
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const aliceRating = res.jsonData.data.ratings.find((r) => r.userId === 1);
    assert(aliceRating && aliceRating.userEmail === 'alice@example.com', '18. Rating entry contains correct user email');
  }

  // 19. Correct user address
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const aliceRating = res.jsonData.data.ratings.find((r) => r.userId === 1);
    assert(aliceRating && aliceRating.userAddress === '101 Alice Way', '19. Rating entry contains correct user address');
  }

  // 20. Correct rating value
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const aliceRating = res.jsonData.data.ratings.find((r) => r.userId === 1);
    assert(aliceRating && aliceRating.rating === 5, '20. Rating entry contains correct rating value (5)');
  }

  // 21. password_hash is never returned
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const raw = JSON.stringify(res.jsonData);
    assert(!raw.includes('password_hash'), '21. password_hash is never exposed in dashboard response JSON');
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 4: AGGREGATE CALCULATIONS & EDGE CASES
  // -----------------------------------------------------------------
  console.log('[Suite 4/5] Aggregate Calculations & Edge Cases:');

  // 22. Average calculated correctly for multiple ratings: Store 2 (Dave) -> (4+5+4)/3 = 4.33
  {
    const { res } = await runChain(
      { user: { id: 4, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.averageRating === 4.33, '22. Average calculated accurately for fractional result (4.33)');
  }

  // 23. Average returned with consistent decimal precision
  {
    const { res } = await runChain(
      { user: { id: 4, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(typeof res.jsonData.data.averageRating === 'number', '23. Average rating is numeric type');
  }

  // 24. No ratings -> averageRating 0
  {
    // Temporarily point owner 4 to Store 3 (unrated)
    mockFixture.stores.find((st) => st.id === 3).owner_id = 4;
    mockFixture.stores.find((st) => st.id === 2).owner_id = 99; // swap
    const { res } = await runChain(
      { user: { id: 4, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.averageRating === 0, '24. Store with no ratings returns averageRating = 0');
  }

  // 25. No ratings -> totalRatings 0 and empty array
  {
    const { res } = await runChain(
      { user: { id: 4, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.jsonData.data.totalRatings === 0 && Array.isArray(res.jsonData.data.ratings) && res.jsonData.data.ratings.length === 0,
      '25. Store with no ratings returns totalRatings = 0 and ratings = []'
    );
    // restore
    mockFixture = buildFixture();
    installMock(mockFixture);
  }

  // 26. Only users who rated the owner's store appear
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const userIds = res.jsonData.data.ratings.map((r) => r.userId);
    assert(
      userIds.includes(1) && userIds.includes(6) && userIds.includes(7),
      "26. All raters of owner's store appear in ratings array"
    );
  }

  // 27. Users who rated another store do not appear if they didn't rate this one
  {
    // Add user 8 who rates ONLY store 2
    mockFixture.users.push({ id: 8, name: 'Exclusive User 8', email: 'u8@ex.com', address: '888 St', role: 'USER' });
    mockFixture.ratings.push({ id: 100, user_id: 8, store_id: 2, rating: 5, created_at: '2026-03-07 10:00:00' });
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const foundU8 = res.jsonData.data.ratings.find((r) => r.userId === 8);
    assert(!foundU8, "27. User rating an unrelated store does not appear on owner's dashboard");
  }

  // 28. Multiple ratings are represented correctly
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(res.jsonData.data.ratings.length === 3, '28. Multiple rating entries are accurately enumerated');
  }

  // 29. Rating values are correct
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' } },
      { handler: ownerController.getOwnerDashboard }
    );
    const rAlice = res.jsonData.data.ratings.find((r) => r.userId === 1);
    const rFrank = res.jsonData.data.ratings.find((r) => r.userId === 6);
    const rGrace = res.jsonData.data.ratings.find((r) => r.userId === 7);
    assert(
      rAlice.rating === 5 && rFrank.rating === 4 && rGrace.rating === 3,
      '29. Individual rating values match fixture submissions (5, 4, 3)'
    );
  }

  // 30. OWNER without store -> 404
  {
    const { res } = await runChain(
      { user: { id: 5, role: 'OWNER' } }, // Eve has no store
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.statusCode === 404 && res.jsonData.message === 'Store not found for this owner',
      '30. OWNER without store receives HTTP 404 Store not found for this owner'
    );
  }

  // 31. Invalid/irrelevant store IDs cannot bypass ownership
  {
    const { res } = await runChain(
      { user: { id: 5, role: 'OWNER' }, query: { storeId: 1 } },
      { handler: ownerController.getOwnerDashboard }
    );
    assert(
      res.statusCode === 404,
      '31. Passing a valid storeId (storeId=1) does not give access to unassigned owner'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // SUITE 5: OPTIONAL LISTING ENDPOINT (GET /api/owner/ratings)
  // -----------------------------------------------------------------
  console.log('[Suite 5/5] Optional Listing Endpoint (GET /api/owner/ratings):');

  // 32. GET /api/owner/ratings: Unauthenticated -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, '32. Owner ratings list: unauthenticated request -> HTTP 401');
  }

  // 33. GET /api/owner/ratings: USER role -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 1, role: 'USER' } });
    authorizeRoles('OWNER')(req, res, next);
    assert(res.statusCode === 403, '33. Owner ratings list: USER role -> HTTP 403 Access denied');
  }

  // 34. GET /api/owner/ratings: ADMIN role -> 403
  {
    const { req, res, next } = mockRequestResponse({ user: { id: 3, role: 'ADMIN' } });
    authorizeRoles('OWNER')(req, res, next);
    assert(res.statusCode === 403, '34. Owner ratings list: ADMIN role -> HTTP 403 Access denied');
  }

  // 35. GET /api/owner/ratings: OWNER role -> 200 with ratings array
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: {} },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    assert(
      res.statusCode === 200 && Array.isArray(res.jsonData.data.ratings),
      '35. Owner ratings list: OWNER role -> HTTP 200 with ratings array'
    );
  }

  // 36. Pagination works (page=1, limit=2 returns first 2 items + totals)
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { page: '1', limit: '2' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    const p = res.jsonData.data.pagination;
    assert(
      res.jsonData.data.ratings.length === 2 && p.page === 1 && p.limit === 2 && p.total === 3 && p.totalPages === 2,
      '36. Pagination works: page 1 with limit 2 returns 2 items and totalPages=2'
    );
  }

  // 37. Sorting asc works (sortBy=rating, sortOrder=asc)
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { sortBy: 'rating', sortOrder: 'asc' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    const ratings = res.jsonData.data.ratings.map((r) => r.rating);
    assert(
      ratings[0] === 3 && ratings[1] === 4 && ratings[2] === 5,
      '37. Sorting asc by rating orders correctly (3, 4, 5)'
    );
  }

  // 38. Sorting desc works (sortBy=rating, sortOrder=desc)
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { sortBy: 'rating', sortOrder: 'desc' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    const ratings = res.jsonData.data.ratings.map((r) => r.rating);
    assert(
      ratings[0] === 5 && ratings[1] === 4 && ratings[2] === 3,
      '38. Sorting desc by rating orders correctly (5, 4, 3)'
    );
  }

  // 39. Invalid sort rejected
  {
    const { res } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { sortBy: 'hacked_column' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    assert(res.statusCode === 400 && res.jsonData.errors.sortBy, '39. Invalid sortBy rejected by whitelist with HTTP 400');
  }

  // 40. Invalid pagination rejected
  {
    const { res: rPage } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { page: '0' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    const { res: rLimit } = await runChain(
      { user: { id: 2, role: 'OWNER' }, query: { limit: '999' } },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    assert(
      rPage.statusCode === 400 && rLimit.statusCode === 400,
      '40. Invalid pagination parameters (page=0, limit=999) rejected with HTTP 400'
    );
  }

  // 41. OWNER without store on /api/owner/ratings -> 404
  {
    const { res } = await runChain(
      { user: { id: 5, role: 'OWNER' }, query: {} },
      { validationMw: validateOwnerRatingsQuery, handler: ownerController.getOwnerRatings }
    );
    assert(
      res.statusCode === 404 && res.jsonData.message === 'Store not found for this owner',
      '41. OWNER without store receives HTTP 404 on /api/owner/ratings'
    );
  }

  restoreMock();

  console.log('\n===============================================================');
  console.log(`   Phase 6 Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%) `);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    console.error('✗ Some Phase 6 tests failed. Review the output above.\n');
    process.exit(1);
  }

  console.log('✓ All Phase 6 Store Owner Backend tests PASSED!\n');
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
