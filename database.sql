-- =============================================================================
-- Store Rating Management System - Phase 2 Database Schema
-- Database: store_rating_system
-- Engine: InnoDB | Character Set: utf8mb4 | Collation: utf8mb4_unicode_ci
-- =============================================================================

CREATE DATABASE IF NOT EXISTS store_rating_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE store_rating_system;

-- -----------------------------------------------------------------------------
-- 1. Table: users
-- Roles: ADMIN, USER, OWNER
-- Passwords stored as bcrypt hashes in password_hash
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  address VARCHAR(400) NOT NULL,
  role ENUM('ADMIN', 'USER', 'OWNER') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes to support search, filtering by role, and sorting
  INDEX idx_users_name (name),
  INDEX idx_users_role (role),
  INDEX idx_users_address (address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- -----------------------------------------------------------------------------
-- 2. Table: stores
-- Relationships: stores.owner_id -> users.id (ON DELETE RESTRICT, ON UPDATE CASCADE)
-- Deleting an owner with active stores is restricted to protect store & rating data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address VARCHAR(400) NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign Key Constraint
  CONSTRAINT fk_stores_owner
    FOREIGN KEY (owner_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Indexes for store search, owner lookup, and email lookup
  INDEX idx_stores_name (name),
  INDEX idx_stores_email (email),
  INDEX idx_stores_address (address),
  INDEX idx_stores_owner_id (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- -----------------------------------------------------------------------------
-- 3. Table: ratings
-- Relationships: ratings.user_id -> users.id, ratings.store_id -> stores.id
-- Rule: exactly ONE rating per user per store (UNIQUE user_id, store_id)
-- Constraint: rating must be between 1 and 5 (CHECK rating BETWEEN 1 AND 5)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  store_id INT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Rating value validation (1 to 5 stars)
  CONSTRAINT chk_ratings_rating
    CHECK (rating BETWEEN 1 AND 5),

  -- Exactly one rating per user for a particular store (allows later modification)
  CONSTRAINT uq_ratings_user_store
    UNIQUE (user_id, store_id),

  -- Foreign Key Constraints
  CONSTRAINT fk_ratings_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_ratings_store
    FOREIGN KEY (store_id)
    REFERENCES stores (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Index on store_id for store rating lookups, average calculations, and joins
  INDEX idx_ratings_store_id (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
