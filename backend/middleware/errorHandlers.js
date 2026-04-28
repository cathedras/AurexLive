const fs = require('fs');

const {
  reactDistDir,
} = require('../config/paths');
const { createLogger } = require('./logger');
const {
  renderNotFoundFallbackHtml,
  renderServerErrorFallbackHtml,
} = require('../utils/fallbackHtml');

const logger = createLogger({ source: 'errorHandler' });

const useViteDevServer = process.env.NODE_ENV !== 'production' && process.env.USE_VITE_DEV_SERVER !== '0';
const hasReactDist = fs.existsSync(reactDistDir);
const canServeFrontendPages = useViteDevServer || hasReactDist;

function prefersHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html');
}

function sendFrontendRouteRedirect(res, routePath) {
  return res.redirect(302, routePath)
}

function notFoundHandler(req, res) {
  if (prefersHtml(req)) {
    if (canServeFrontendPages) {
      return sendFrontendRouteRedirect(res, '/page/error/404')
    }

    return res.status(404).send(renderNotFoundFallbackHtml())
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
    if (canServeFrontendPages) {
      return sendFrontendRouteRedirect(res, '/page/error/500')
    }

    return res.status(500).send(renderServerErrorFallbackHtml())
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
