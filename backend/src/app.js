const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const storeRoutes = require('./routes/store.routes');
const ownerRoutes = require('./routes/owner.routes');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// CORS configuration with explicit origin and credentials support
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Body and cookie parsers
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/owner', ownerRoutes);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
