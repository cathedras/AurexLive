const express = require('express');

const router = express.Router();

router.post('/', (req, res) => {
  const source = String(req.body?.source || 'frontend').trim();
  const message = String(req.body?.message || 'unknown error').trim();
  const stack = String(req.body?.stack || '').trim();
  const page = String(req.body?.page || '').trim();
  const timestamp = String(req.body?.timestamp || new Date().toISOString()).trim();
  const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : null;

  console.error('[ClientError]', {
    source,
    message,
    page,
    timestamp,
    meta,
    stack
  });

  return res.json({
    success: true
  });
});

module.exports = router;
