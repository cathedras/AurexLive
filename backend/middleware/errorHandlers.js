const {
  notFoundHtmlPath,
  internalServerErrorHtmlPath
} = require('../config/paths');
const { createLogger } = require('./logger');

const logger = createLogger({ source: 'errorHandler' });

function prefersHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html');
}

function notFoundHandler(req, res) {
  if (prefersHtml(req)) {
    return res.status(404).sendFile(notFoundHtmlPath);
  }

  return res.status(404).json({
    success: false,
    message: 'Resource not found.'
  });
}

function errorHandler(err, req, res, next) {
  logger.error(err instanceof Error ? err : `Unhandled error: ${String(err)}`);

  if (res.headersSent) {
    return next(err);
  }

  if (prefersHtml(req)) {
    return res.status(500).sendFile(internalServerErrorHtmlPath);
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error.',
    requestId: req.requestId || null
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
