const express = require('express');

function normalizeExtensionError(body = {}) {
  const source = String(body.source || 'wechat-web-extension').trim();
  const component = String(body.component || 'unknown').trim();
  const stage = String(body.stage || 'unknown').trim();
  const severity = String(body.severity || 'error').trim();
  const message = String(body.message || 'unknown extension error').trim();
  const stack = String(body.stack || '').trim();
  const page = String(body.page || '').trim();
  const timestamp = String(body.timestamp || new Date().toISOString()).trim();
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : null;

  return {
    source,
    component,
    stage,
    severity,
    message,
    stack,
    page,
    timestamp,
    meta,
  };
}

function createExtensionErrorRouter(options = {}) {
  const logger = options.logger || console;
  const router = express.Router();

  router.post('/', (req, res) => {
    const report = normalizeExtensionError(req.body || {});

    logger.error('[ExtensionError]', report);

    return res.json({
      success: true,
      report,
    });
  });

  return router;
}

module.exports = createExtensionErrorRouter();
module.exports.createExtensionErrorRouter = createExtensionErrorRouter;
module.exports.normalizeExtensionError = normalizeExtensionError;