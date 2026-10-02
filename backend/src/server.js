require('dotenv').config();

const { getJwtSecret } = require('./config/authConfig');

// Fail fast on startup if JWT_SECRET is missing or empty
try {
  getJwtSecret();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Check MySQL database connection on startup
  await testConnection();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
