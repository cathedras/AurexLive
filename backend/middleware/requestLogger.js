const { createLogger } = require('./logger');

const logger = createLogger({ source: 'requestLogger' });

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';
  const requestId = Math.random().toString(36).slice(2, 10);

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    if (isProduction) {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
      return;
    }

    const userAgent = req.get('user-agent') || '-';
    const clientIp = req.ip || req.socket?.remoteAddress || '-';
    logger.info(
      `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms ip=${clientIp} ua="${userAgent}"`
    );
  });

  next();
}

module.exports = requestLogger;
