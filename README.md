# Store Rating System - Phase 1, Phase 2 & Phase 3

Full Stack Store Rating Management System built with Node.js, Express, MySQL, and React (Vite).

## Tech Stack

- **Backend:** Node.js, Express.js, MySQL (`mysql2` connection pool), `cookie-parser`, `dotenv`, `cors`, `helmet`, `bcryptjs`, `jsonwebtoken`
- **Frontend:** React.js, Vite, React Router (`react-router-dom`), JavaScript
- **Database:** MySQL 8.x (InnoDB, `utf8mb4`)

## Project Structure

```
store-rating-system/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                 # MySQL connection pool configuration
│   │   │   └── cookieConfig.js       # Centralized HTTP-only cookie configuration
│   │   ├── controllers/
│   │   │   └── authController.js     # Register, Login, Me, Change Password, Logout
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js     # JWT verification from HTTP-only cookie
│   │   │   ├── roleMiddleware.js     # Reusable RBAC authorization (authorizeRoles)
│   │   │   ├── errorHandler.js       # Centralized error handler
│   │   │   └── notFoundHandler.js    # 404 handler for unknown routes
│   │   ├── routes/
│   │   │   ├── auth.routes.js        # Authentication & user profile routes
│   │   │   └── health.routes.js      # GET /api/health
│   │   ├── validators/
│   │   │   └── authValidator.js      # Register, Login, Change Password validators
│   │   ├── app.js                    # Express app configuration (CORS, Helmet, Parsers)
│   │   └── server.js                 # Server entry point
│   ├── scripts/
│   │   ├── test-auth.js              # Comprehensive Phase 3 Auth & RBAC test suite
│   │   └── verify-db.js              # Database verification script
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   │   └── api.js                # Reusable fetch client with credentials: 'include'
│   │   ├── context/
│   │   ├── App.jsx                   # React Router root setup
│   │   └── main.jsx                  # Entry point
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
├── database.sql                      # Complete Phase 2 database schema
├── verification.sql                  # SQL verification & constraint check queries
├── README.md
└── .gitignore
```

## Getting Started

### 1. Database Setup

1. Ensure MySQL server is running.
2. Initialize database and tables using `database.sql`:
   ```bash
   mysql -u root -p < database.sql
   ```
   Or execute directly in your MySQL client / MySQL Workbench.

### 2. Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables file:
   ```bash
   cp .env.example .env
   ```
   Update configuration in `.env`:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=store_rating_system
   DB_PORT=3306
   JWT_SECRET=replace_with_a_long_random_secret
   JWT_EXPIRES_IN=1d
   FRONTEND_URL=http://localhost:5173
   ```
4. Verify database schema and constraints:
   ```bash
   npm run db:verify
   ```
5. Run the Phase 3 Auth & RBAC test suite:
   ```bash
   npm run test:auth
   ```
6. Start the backend server:
   ```bash
   npm start
   ```
   Backend runs on `http://localhost:5000`.

### 3. Frontend Setup

1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables file:
   ```bash
   cp .env.example .env
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`.

---

## Authentication & Authorization API (Phase 3)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (always assigns `USER` role) |
| `POST` | `/api/auth/login` | Public | Login with email & password, sets HTTP-only cookie |
| `POST` | `/api/auth/logout` | Authenticated | Clears HTTP-only JWT cookie |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile |
| `PATCH` | `/api/auth/password` | Authenticated | Update user password |
