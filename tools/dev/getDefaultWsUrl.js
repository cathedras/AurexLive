/**
 * Build a WebSocket URL from environment variables or sensible defaults.
 *
 * Env vars (all optional):
 *   WS_URL          – full URL, wins over everything (e.g. wss://example.com/ws)
 *   WS_PROTOCOL     – explicit scheme without "://" (ws or wss)
 *   WS_USE_HTTPS    – set to 1/true/yes to default to wss when WS_PROTOCOL is absent
 *   WS_HOST         – hostname (default: localhost)
 *   WS_PORT         – port (default: 3000)
 *   WS_PATH         – pathname, leading "/" optional (default: /)
 */
function getDefaultWsUrl() {
  if (process.env.WS_URL) {
    return process.env.WS_URL;
  }

  const scheme = String(process.env.WS_PROTOCOL || '').trim() || (
    ['1', 'true', 'yes'].includes(String(process.env.WS_USE_HTTPS || '').trim().toLowerCase())
      ? 'wss'
      : 'ws'
  );
  const host = process.env.WS_HOST || 'localhost';
  const port = process.env.WS_PORT || '3000';
  const pathname = process.env.WS_PATH || '/';
  const suffix = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return `${scheme}://${host}:${port}${suffix}`;
}

module.exports = { getDefaultWsUrl };
