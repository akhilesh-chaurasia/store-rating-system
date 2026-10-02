// Centralized error-handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Something went wrong';

  res.status(status).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;
