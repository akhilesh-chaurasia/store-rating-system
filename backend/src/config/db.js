const mysql = require('mysql2/promise');

// Create MySQL connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'store_rating_system',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper function to verify database connectivity
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`Successfully connected to MySQL database: ${process.env.DB_NAME || 'store_rating_system'}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL connection failed:', error.code || error.message || error);
    return false;
  }
};

module.exports = {
  pool,
  testConnection,
};
