const {
  notFoundHtmlPath,
  internalServerErrorHtmlPath
} = require('../config/paths');

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
    message: '资源不存在'
  });
}

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (prefersHtml(req)) {
    return res.status(500).sendFile(internalServerErrorHtmlPath);
  }

  return res.status(500).json({
    success: false,
    message: '服务器内部错误',
    requestId: req.requestId || null
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
