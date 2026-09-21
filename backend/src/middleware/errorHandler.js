const env = require("../config/env");
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  // The database refused an entry dated inside a closed month. Its message is
  // already written for a person, so it is passed on as it is.
  if (err.hint === "closed_period") {
    status = 409;
  } else if (err.code === "23505") {
    status = 409;
    message = "That value is already in use";
    details = err.detail;
  } else if (err.code === "23503") {
    status = 400;
    message = "Referenced record does not exist";
  } else if (err.code === "22P02") {
    status = 400;
    message = "Invalid identifier";
  } else if (err.name === "ZodError") {
    status = 400;
    message = "Validation failed";
    details = err.issues;
  }

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(env.isProd ? {} : { stack: err.stack }),
    },
  });
}

module.exports = { notFound, errorHandler };
