-- =============================================================================
-- Phase 2 Database Verification Script
-- Run this in MySQL CLI or MySQL Workbench to verify schema, constraints & indexes
-- =============================================================================

USE store_rating_system;

-- 1. Verify tables existence
SHOW TABLES;

-- 2. Describe table schemas
DESCRIBE users;
DESCRIBE stores;
DESCRIBE ratings;

-- 3. Show complete table definitions & constraints
SHOW CREATE TABLE users\G
SHOW CREATE TABLE stores\G
SHOW CREATE TABLE ratings\G

-- 4. Verify indexes
SHOW INDEX FROM users;
SHOW INDEX FROM stores;
SHOW INDEX FROM ratings;

-- -----------------------------------------------------------------------------
-- 5. Verification Tests (Constraint & Foreign Key Checks)
-- -----------------------------------------------------------------------------

START TRANSACTION;

-- Test A: Insert a valid user
INSERT INTO users (name, email, password_hash, address, role)
VALUES ('Test Owner Account 12345', 'owner@example.com', '$2a$10$hashedpasswordstringforuser', '123 Test Street, Suite 100', 'OWNER');

SET @owner_id = LAST_INSERT_ID();

-- Test B: Verify duplicate email is REJECTED (Expected error: ER_DUP_ENTRY)
-- INSERT INTO users (name, email, password_hash, address, role)
-- VALUES ('Duplicate Email User 12345', 'owner@example.com', '$2a$10$hashedpasswordstringforuser', '456 Test Street', 'USER');

-- Test C: Insert a valid store
INSERT INTO stores (name, email, address, owner_id)
VALUES ('Grand Coffee Store 12345', 'coffee@example.com', '789 Market Avenue', @owner_id);

SET @store_id = LAST_INSERT_ID();

-- Test D: Insert a valid normal user
INSERT INTO users (name, email, password_hash, address, role)
VALUES ('Test Normal User 12345678', 'user@example.com', '$2a$10$hashedpasswordstringforuser', '101 Normal Road', 'USER');

SET @user_id = LAST_INSERT_ID();

-- Test E: Insert valid rating (4 stars)
INSERT INTO ratings (user_id, store_id, rating)
VALUES (@user_id, @store_id, 4);

-- Test F: Verify duplicate user_id + store_id is REJECTED (Expected error: ER_DUP_ENTRY)
-- INSERT INTO ratings (user_id, store_id, rating)
-- VALUES (@user_id, @store_id, 5);

-- Test G: Verify rating 0 is REJECTED (Expected error: CHECK constraint violated)
-- INSERT INTO ratings (user_id, store_id, rating)
-- VALUES (@user_id, @store_id, 0);

-- Test H: Verify rating 6 is REJECTED (Expected error: CHECK constraint violated)
-- INSERT INTO ratings (user_id, store_id, rating)
-- VALUES (@user_id, @store_id, 6);

-- Test I: Verify ON DELETE RESTRICT on store owner (Expected error: Foreign key constraint fails)
-- DELETE FROM users WHERE id = @owner_id;

-- Rollback transaction so no sample data is retained
ROLLBACK;
