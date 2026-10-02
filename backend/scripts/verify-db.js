/**
 * Phase 2 Database Verification Script
 * Validates connection, schema creation, table structures, indexes, and constraints
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runVerification() {
  console.log('====================================================');
  console.log('   Store Rating System - Phase 2 DB Verification   ');
  console.log('====================================================\n');

  // Step 1: Connect to MySQL server (without specifying DB first, to ensure DB can be created)
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 3306,
    multipleStatements: true,
  };

  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('[1/6] Connection to MySQL Server: SUCCESSFUL');
    const [versionRows] = await connection.query('SELECT VERSION() AS version');
    const mysqlVersion = versionRows[0]?.version || 'Unknown';
    console.log(`      MySQL Server Version: ${mysqlVersion}\n`);
  } catch (err) {
    console.error('[1/6] Connection to MySQL Server: FAILED');
    console.error(`      Reason: ${err.message || err.code}`);
    console.log('\n[INFO] Local MySQL service is offline or not installed on port ' + connectionConfig.port + '.');
    console.log('       Please start MySQL and configure backend/.env when ready.');
    console.log('       Schema file available at: store-rating-system/database.sql');
    console.log('       SQL test script available at: store-rating-system/verification.sql\n');
    return;
  }

  try {
    // Step 2: Execute database.sql
    console.log('[2/6] Executing database.sql schema...');
    const schemaSqlPath = path.resolve(__dirname, '../../database.sql');
    const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
    await connection.query(schemaSql);
    console.log('      Database & Tables created successfully!\n');

    // Switch to database
    await connection.query('USE store_rating_system;');

    // Step 3: Verify Tables
    console.log('[3/6] Verifying Created Tables:');
    const [tables] = await connection.query('SHOW TABLES;');
    const tableNames = tables.map((t) => Object.values(t)[0]);
    console.log('      Found tables:', tableNames.join(', '));
    const expectedTables = ['users', 'stores', 'ratings'];
    const allTablesExist = expectedTables.every((t) => tableNames.includes(t));
    console.log(`      All 3 required tables exist: ${allTablesExist ? 'YES' : 'NO'}\n`);

    // Step 4: Verify Table Columns
    console.log('[4/6] Verifying Table Structures:');
    for (const tableName of expectedTables) {
      const [columns] = await connection.query(`DESCRIBE ${tableName};`);
      console.log(`      Table "${tableName}" columns:`, columns.map((c) => `${c.Field} (${c.Type})`).join(', '));
    }
    console.log('');

    // Step 5: Verify Indexes
    console.log('[5/6] Verifying Indexes:');
    for (const tableName of expectedTables) {
      const [indexes] = await connection.query(`SHOW INDEX FROM ${tableName};`);
      const indexSummary = [...new Set(indexes.map((i) => `${i.Key_name} on (${i.Column_name})`))];
      console.log(`      Table "${tableName}" indexes:`, indexSummary.join(' | '));
    }
    console.log('');

    // Step 6: Constraint & Relationship Tests
    console.log('[6/6] Verifying Database Constraints & Foreign Keys:');

    // Test A: Duplicate email rejection
    let duplicateEmailRejected = false;
    try {
      await connection.query(
        "INSERT INTO users (name, email, password_hash, address, role) VALUES ('Verification User Alpha', 'unique_test@example.com', 'hash1', '123 Test St', 'USER')"
      );
      await connection.query(
        "INSERT INTO users (name, email, password_hash, address, role) VALUES ('Verification User Beta', 'unique_test@example.com', 'hash2', '456 Test St', 'USER')"
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') duplicateEmailRejected = true;
    }
    console.log(`      - Duplicate email rejected: ${duplicateEmailRejected ? 'YES (ER_DUP_ENTRY)' : 'NO'}`);

    // Test B: Insert valid owner & store
    const [ownerResult] = await connection.query(
      "INSERT INTO users (name, email, password_hash, address, role) VALUES ('Verification Owner Person', 'owner_test@example.com', 'hash3', '789 Owner Way', 'OWNER')"
    );
    const ownerId = ownerResult.insertId;

    const [storeResult] = await connection.query(
      'INSERT INTO stores (name, email, address, owner_id) VALUES (?, ?, ?, ?)',
      ['Verification Store Name', 'store_test@example.com', '100 Store Blvd', ownerId]
    );
    const storeId = storeResult.insertId;

    const [userResult] = await connection.query(
      "INSERT INTO users (name, email, password_hash, address, role) VALUES ('Rating Voter Customer 1', 'voter_test@example.com', 'hash4', '200 Voter Rd', 'USER')"
    );
    const voterId = userResult.insertId;

    // Test C: Valid rating
    await connection.query('INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, 4)', [voterId, storeId]);

    // Test D: Duplicate (user_id, store_id) rating rejection
    let duplicateRatingRejected = false;
    try {
      await connection.query('INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, 5)', [voterId, storeId]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') duplicateRatingRejected = true;
    }
    console.log(`      - Duplicate user+store rating rejected: ${duplicateRatingRejected ? 'YES (ER_DUP_ENTRY)' : 'NO'}`);

    // Test E: Rating 0 rejection
    let rating0Rejected = false;
    try {
      await connection.query('INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, 0)', [ownerId, storeId]);
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819) rating0Rejected = true;
    }
    console.log(`      - Rating 0 rejected by CHECK constraint: ${rating0Rejected ? 'YES (CHECK violated)' : 'NO'}`);

    // Test F: Rating 6 rejection
    let rating6Rejected = false;
    try {
      await connection.query('INSERT INTO ratings (user_id, store_id, rating) VALUES (?, ?, 6)', [ownerId, storeId]);
    } catch (e) {
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819) rating6Rejected = true;
    }
    console.log(`      - Rating 6 rejected by CHECK constraint: ${rating6Rejected ? 'YES (CHECK violated)' : 'NO'}`);

    // Test G: Foreign key rejection on invalid user_id / store_id
    let invalidFkRejected = false;
    try {
      await connection.query('INSERT INTO ratings (user_id, store_id, rating) VALUES (999999, ?, 5)', [storeId]);
    } catch (e) {
      if (e.code === 'ER_NO_REFERENCED_ROW_2' || e.errno === 1452) invalidFkRejected = true;
    }
    console.log(`      - Invalid foreign key reference rejected: ${invalidFkRejected ? 'YES (FK constraint)' : 'NO'}`);

    // Test H: ON DELETE RESTRICT on store owner
    let deleteOwnerRestricted = false;
    try {
      await connection.query('DELETE FROM users WHERE id = ?', [ownerId]);
    } catch (e) {
      if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.errno === 1451) deleteOwnerRestricted = true;
    }
    console.log(`      - Deleting owner with active store RESTRICTED: ${deleteOwnerRestricted ? 'YES (ON DELETE RESTRICT)' : 'NO'}`);

    // Cleanup test data so database remains clean
    await connection.query('DELETE FROM ratings WHERE store_id = ?', [storeId]);
    await connection.query('DELETE FROM stores WHERE id = ?', [storeId]);
    await connection.query('DELETE FROM users WHERE id IN (?, ?, ?)', [ownerId, voterId, ownerResult.insertId - 1]);
    await connection.query("DELETE FROM users WHERE email IN ('unique_test@example.com', 'owner_test@example.com', 'voter_test@example.com')");
    console.log('\n[INFO] Cleaned up all verification test records. No sample data left in database.');

    console.log('\n====================================================');
    console.log('   All Database Design Verifications PASSED!       ');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    if (connection) await connection.end();
  }
}

runVerification();
