/**
 * Comprehensive Automated Test Suite for Phase 3:
 * Authentication and Role-Based Access Control (RBAC)
 */
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_not_for_prod';
}

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateRegister, validateLogin, validateChangePassword } = require('../src/validators/authValidator');
const { authenticate } = require('../src/middleware/authMiddleware');
const { authorizeRoles } = require('../src/middleware/roleMiddleware');
const { COOKIE_NAME, getCookieOptions, getClearCookieOptions } = require('../src/config/cookieConfig');
const authController = require('../src/controllers/authController');
const { pool } = require('../src/config/db');

// Helper to simulate Express req, res, next
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
    nextError = err;
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

async function runTests() {
  console.log('===============================================================');
  console.log('    Phase 3: Auth & RBAC Comprehensive Test Suite              ');
  console.log('===============================================================\n');

  const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_key_for_dev_change_in_prod';

  // -----------------------------------------------------------------
  // 1. REGISTRATION VALIDATION TESTS
  // -----------------------------------------------------------------
  console.log('[Suite 1/5] Testing Registration Validation:');

  // Test 1.1: Name below 20 characters
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Short Name',
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'ValidPassword@123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.name, 'Rejects name shorter than 20 characters with HTTP 400');
  }

  // Test 1.2: Name above 60 characters
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'A'.repeat(61),
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'ValidPassword@123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.name, 'Rejects name longer than 60 characters with HTTP 400');
  }

  // Test 1.3: Invalid email format
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'invalid-email-format',
        address: 'Valid address street 123',
        password: 'ValidPassword@123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.email, 'Rejects invalid email format with HTTP 400');
  }

  // Test 1.4: Password shorter than 8 characters
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'Pass@1',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.password, 'Rejects password shorter than 8 characters with HTTP 400');
  }

  // Test 1.5: Password longer than 16 characters
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'VeryLongPassword@1234567890',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.password, 'Rejects password longer than 16 characters with HTTP 400');
  }

  // Test 1.6: Password missing uppercase letter
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'lowercase@123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.password, 'Rejects password without uppercase letter with HTTP 400');
  }

  // Test 1.7: Password missing special character
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'valid@example.com',
        address: 'Valid address street 123',
        password: 'NoSpecialChar123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.password, 'Rejects password without special character with HTTP 400');
  }

  // Test 1.8: Address exceeding 400 characters
  {
    const { req, res, next } = mockRequestResponse({
      body: {
        name: 'Valid Full Legal Name 123',
        email: 'valid@example.com',
        address: 'A'.repeat(401),
        password: 'ValidPassword@123',
      },
    });
    validateRegister(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.address, 'Rejects address longer than 400 characters with HTTP 400');
  }

  // Test 1.9: Valid registration input passes validation & normalizes email to lowercase
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({
      body: {
        name: '   Valid Full Legal Name 123   ',
        email: '  USER@EXAMPLE.COM  ',
        address: '  Valid address street 123  ',
        password: 'ValidPass@123',
      },
    });
    validateRegister(req, res, next);
    assert(
      wasNextCalled() && req.body.email === 'user@example.com' && req.body.name === 'Valid Full Legal Name 123',
      'Passes valid registration and normalizes email to lowercase & trims whitespace'
    );
  }

  console.log('');

  // -----------------------------------------------------------------
  // 2. LOGIN & CHANGE PASSWORD VALIDATION TESTS
  // -----------------------------------------------------------------
  console.log('[Suite 2/5] Testing Login & Password Change Validation:');

  // Test 2.1: Missing login credentials
  {
    const { req, res, next } = mockRequestResponse({ body: {} });
    validateLogin(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.email && res.jsonData.errors.password, 'Rejects login without email/password with HTTP 400');
  }

  // Test 2.2: Change password missing current password
  {
    const { req, res, next } = mockRequestResponse({
      body: { newPassword: 'NewPassword@123' },
    });
    validateChangePassword(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.currentPassword, 'Rejects change password without current password with HTTP 400');
  }

  // Test 2.3: Change password with invalid new password
  {
    const { req, res, next } = mockRequestResponse({
      body: { currentPassword: 'OldPassword@123', newPassword: 'weak' },
    });
    validateChangePassword(req, res, next);
    assert(res.statusCode === 400 && res.jsonData.errors.newPassword, 'Rejects invalid new password with HTTP 400');
  }

  console.log('');

  // -----------------------------------------------------------------
  // 3. AUTHENTICATION MIDDLEWARE TESTS
  // -----------------------------------------------------------------
  console.log('[Suite 3/5] Testing Authentication Middleware:');

  // Test 3.1: Request without token cookie -> 401
  {
    const { req, res, next } = mockRequestResponse();
    authenticate(req, res, next);
    assert(res.statusCode === 401, 'Rejects unauthenticated request without cookie with HTTP 401');
  }

  // Test 3.2: Request with invalid JWT token -> 401
  {
    const { req, res, next } = mockRequestResponse({
      cookies: { [COOKIE_NAME]: 'invalid.token.structure' },
    });
    authenticate(req, res, next);
    assert(res.statusCode === 401, 'Rejects request with invalid JWT with HTTP 401');
  }

  // Test 3.3: Request with expired JWT token -> 401
  {
    const expiredToken = jwt.sign({ userId: 1, role: 'USER' }, JWT_SECRET, { expiresIn: '0s' });
    const { req, res, next } = mockRequestResponse({
      cookies: { [COOKIE_NAME]: expiredToken },
    });
    authenticate(req, res, next);
    assert(res.statusCode === 401, 'Rejects request with expired JWT with HTTP 401');
  }

  // Test 3.4: Request with valid JWT token -> sets req.user (id, role)
  {
    const validToken = jwt.sign({ userId: 42, role: 'USER' }, JWT_SECRET, { expiresIn: '1h' });
    const { req, res, next, wasNextCalled } = mockRequestResponse({
      cookies: { [COOKIE_NAME]: validToken },
    });
    authenticate(req, res, next);
    assert(wasNextCalled() && req.user.id === 42 && req.user.role === 'USER', 'Authenticates valid JWT and populates req.user.id & req.user.role');
  }

  console.log('');

  // -----------------------------------------------------------------
  // 4. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
  // -----------------------------------------------------------------
  console.log('[Suite 4/5] Testing Role-Based Authorization Middleware:');

  // Test 4.1: USER cannot access ADMIN route -> 403
  {
    const { req, res, next } = mockRequestResponse({
      user: { id: 10, role: 'USER' },
    });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', 'Denies USER from accessing ADMIN route with HTTP 403');
  }

  // Test 4.2: OWNER cannot access ADMIN route -> 403
  {
    const { req, res, next } = mockRequestResponse({
      user: { id: 20, role: 'OWNER' },
    });
    authorizeRoles('ADMIN')(req, res, next);
    assert(res.statusCode === 403 && res.jsonData.message === 'Access denied', 'Denies OWNER from accessing ADMIN route with HTTP 403');
  }

  // Test 4.3: ADMIN can access ADMIN route -> 200 (allowed)
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({
      user: { id: 30, role: 'ADMIN' },
    });
    authorizeRoles('ADMIN')(req, res, next);
    assert(wasNextCalled(), 'Allows ADMIN to access ADMIN route');
  }

  // Test 4.4: USER can access USER route -> 200 (allowed)
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({
      user: { id: 10, role: 'USER' },
    });
    authorizeRoles('USER')(req, res, next);
    assert(wasNextCalled(), 'Allows USER to access USER route');
  }

  // Test 4.5: OWNER can access OWNER route -> 200 (allowed)
  {
    const { req, res, next, wasNextCalled } = mockRequestResponse({
      user: { id: 20, role: 'OWNER' },
    });
    authorizeRoles('OWNER')(req, res, next);
    assert(wasNextCalled(), 'Allows OWNER to access OWNER route');
  }

  // Test 4.6: Multi-role authorization (ADMIN or OWNER)
  {
    const { req: req1, res: res1, next: next1, wasNextCalled: nextCalled1 } = mockRequestResponse({
      user: { id: 20, role: 'OWNER' },
    });
    authorizeRoles('ADMIN', 'OWNER')(req1, res1, next1);

    const { req: req2, res: res2, next: next2 } = mockRequestResponse({
      user: { id: 10, role: 'USER' },
    });
    authorizeRoles('ADMIN', 'OWNER')(req2, res2, next2);

    assert(nextCalled1() && res2.statusCode === 403, 'Multi-role authorization correctly permits OWNER and denies USER');
  }

  console.log('');

  // -----------------------------------------------------------------
  // 5. CONTROLLER LOGIC & SECURITY RULES
  // -----------------------------------------------------------------
  console.log('[Suite 5/5] Testing Controller Business Logic & Security Rules:');

  // In-memory mock database store for controller verification
  const mockDbUsers = [];
  let nextUserId = 1;

  // Swap pool.execute for mockDb during controller tests
  const originalExecute = pool.execute;
  pool.execute = async (sql, params) => {
    // 1. SELECT id FROM users WHERE email = ?
    if (sql.includes('SELECT id FROM users WHERE email = ?')) {
      const email = params[0];
      const found = mockDbUsers.filter((u) => u.email === email);
      return [found.map((u) => ({ id: u.id }))];
    }

    // 2. INSERT INTO users (name, email, password_hash, address, role) VALUES (?, ?, ?, ?, ?)
    if (sql.includes('INSERT INTO users')) {
      const [name, email, password_hash, address, role] = params;
      // Check duplicate constraint
      if (mockDbUsers.some((u) => u.email === email)) {
        const dupError = new Error("Duplicate entry for key 'email'");
        dupError.code = 'ER_DUP_ENTRY';
        dupError.errno = 1062;
        throw dupError;
      }
      const newUser = { id: nextUserId++, name, email, password_hash, address, role };
      mockDbUsers.push(newUser);
      return [{ insertId: newUser.id }];
    }

    // 3. SELECT id, name, email, password_hash, address, role FROM users WHERE email = ?
    if (sql.includes('SELECT id, name, email, password_hash, address, role FROM users WHERE email = ?')) {
      const email = params[0];
      const found = mockDbUsers.filter((u) => u.email === email);
      return [found];
    }

    // 4. SELECT id, name, email, address, role FROM users WHERE id = ?
    if (sql.includes('SELECT id, name, email, address, role FROM users WHERE id = ?')) {
      const id = params[0];
      const found = mockDbUsers.filter((u) => u.id === id);
      return [found];
    }

    // 5. SELECT id, password_hash FROM users WHERE id = ?
    if (sql.includes('SELECT id, password_hash FROM users WHERE id = ?')) {
      const id = params[0];
      const found = mockDbUsers.filter((u) => u.id === id).map((u) => ({ id: u.id, password_hash: u.password_hash }));
      return [found];
    }

    // 6. UPDATE users SET password_hash = ? WHERE id = ?
    if (sql.includes('UPDATE users SET password_hash = ? WHERE id = ?')) {
      const [newHash, id] = params;
      const user = mockDbUsers.find((u) => u.id === id);
      if (user) user.password_hash = newHash;
      return [{ affectedRows: 1 }];
    }

    return [[]];
  };

  try {
    // Test 5.1: Registration ignores role=ADMIN and forces role='USER'
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          name: 'First Registered User Person',
          email: 'first@example.com',
          address: '456 Elm Street',
          password: 'Password@123',
          role: 'ADMIN', // Attacker attempts to become admin
        },
      });
      await authController.register(req, res, next);
      assert(
        res.statusCode === 201 &&
          res.jsonData.data.user.role === 'USER' &&
          !res.jsonData.data.user.password_hash,
        'Public registration strictly forces role="USER" even when role="ADMIN" is passed, and never returns password_hash'
      );
    }

    // Test 5.2: Registration ignores role=OWNER and forces role='USER'
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          name: 'Second Registered User Person',
          email: 'second@example.com',
          address: '789 Oak Street',
          password: 'Password@123',
          role: 'OWNER', // Attacker attempts to become owner
        },
      });
      await authController.register(req, res, next);
      assert(
        res.statusCode === 201 && res.jsonData.data.user.role === 'USER',
        'Public registration strictly forces role="USER" when role="OWNER" is passed'
      );
    }

    // Test 5.3: Duplicate email registration returns HTTP 409
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          name: 'Duplicate Account Attempt Person',
          email: 'first@example.com',
          address: '111 Duplicate Road',
          password: 'Password@123',
        },
      });
      await authController.register(req, res, next);
      assert(res.statusCode === 409 && res.jsonData.message === 'Email is already registered', 'Duplicate email returns HTTP 409 with friendly error message');
    }

    // Test 5.4: Login with correct credentials sets HTTP-only cookie and returns user
    let userToken = null;
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          email: 'first@example.com',
          password: 'Password@123',
        },
      });
      await authController.login(req, res, next);
      const cookie = res.cookieData[COOKIE_NAME];
      userToken = cookie?.val;

      assert(
        res.statusCode === 200 &&
          cookie &&
          cookie.options.httpOnly === true &&
          res.jsonData.data.user.email === 'first@example.com' &&
          !res.jsonData.data.user.password_hash,
        'Successful login returns HTTP 200, sets HTTP-only JWT cookie, and returns user data without password_hash'
      );
    }

    // Test 5.5: Login with wrong password returns HTTP 401 with generic error
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          email: 'first@example.com',
          password: 'WrongPassword@999',
        },
      });
      await authController.login(req, res, next);
      assert(res.statusCode === 401 && res.jsonData.message === 'Invalid email or password', 'Login with wrong password returns HTTP 401 with generic message');
    }

    // Test 5.6: Login with non-existent email returns same HTTP 401 generic error
    {
      const { req, res, next } = mockRequestResponse({
        body: {
          email: 'nonexistent@example.com',
          password: 'Password@123',
        },
      });
      await authController.login(req, res, next);
      assert(res.statusCode === 401 && res.jsonData.message === 'Invalid email or password', 'Login with non-existent email returns exact same generic HTTP 401');
    }

    // Test 5.7: GET /api/auth/me returns fresh user data
    {
      const { req, res, next } = mockRequestResponse({
        user: { id: 1, role: 'USER' },
      });
      await authController.getMe(req, res, next);
      assert(
        res.statusCode === 200 &&
          res.jsonData.data.user.id === 1 &&
          res.jsonData.data.user.email === 'first@example.com' &&
          !res.jsonData.data.user.password_hash,
        'GET /api/auth/me returns fresh profile for req.user.id without password_hash'
      );
    }

    // Test 5.8: Change password with wrong current password returns HTTP 400
    {
      const { req, res, next } = mockRequestResponse({
        user: { id: 1, role: 'USER' },
        body: {
          currentPassword: 'WrongOldPassword@123',
          newPassword: 'BrandNewPassword@456',
        },
      });
      await authController.changePassword(req, res, next);
      assert(res.statusCode === 400 && res.jsonData.message === 'Current password is incorrect', 'Rejects change password with wrong current password with HTTP 400');
    }

    // Test 5.9: Change password with correct current password succeeds
    {
      const { req, res, next } = mockRequestResponse({
        user: { id: 1, role: 'USER' },
        body: {
          currentPassword: 'Password@123',
          newPassword: 'BrandNewPassword@456',
        },
      });
      await authController.changePassword(req, res, next);
      assert(res.statusCode === 200 && res.jsonData.message === 'Password changed successfully', 'Successfully updates password with HTTP 200');
    }

    // Test 5.10: Verify old password no longer works and new password works
    {
      const { req: oldReq, res: oldRes, next: oldNext } = mockRequestResponse({
        body: { email: 'first@example.com', password: 'Password@123' },
      });
      await authController.login(oldReq, oldRes, oldNext);

      const { req: newReq, res: newRes, next: newNext } = mockRequestResponse({
        body: { email: 'first@example.com', password: 'BrandNewPassword@456' },
      });
      await authController.login(newReq, newRes, newNext);

      assert(
        oldRes.statusCode === 401 && newRes.statusCode === 200,
        'Old password is invalidated and new password successfully logs in'
      );
    }

    // Test 5.11: Logout clears HTTP-only cookie
    {
      const { req, res } = mockRequestResponse({
        user: { id: 1, role: 'USER' },
      });
      authController.logout(req, res);
      const cleared = res.clearedCookies.find((c) => c.name === COOKIE_NAME);
      assert(
        res.statusCode === 200 && cleared && cleared.options.httpOnly === true,
        'Logout returns HTTP 200 and clears HTTP-only JWT cookie with matching options'
      );
    }
  } finally {
    pool.execute = originalExecute;
  }

  console.log('\n===============================================================');
  console.log(`   Test Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%) `);
  console.log('===============================================================\n');

  if (passedTests === totalTests) {
    console.log('✓ All Phase 3 Authentication & RBAC security requirements PASSED!\n');
  } else {
    console.error('✗ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
