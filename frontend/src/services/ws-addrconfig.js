// Build WS attempt URLs for a websocket client type and optional JSON param.
export function buildWsTrustHint(target) {
  const values = Array.isArray(target) ? target : [target];
  const hasSecureWs = values.some((value) => String(value || '').startsWith('wss://'));

  if (!hasSecureWs) {
    return '';
  }

  return 'WSS 连接失败。当前页面通过 HTTPS 访问时，如果浏览器没有信任开发证书，握手通常会直接失败。请先信任 certs/backend-dev.crt，然后重试。';
}

export function buildWsAttemptUrls(clientType = 'ws', param) {
  const scheme = 'wss';
  const apiPort = import.meta.env.VITE_API_PORT || '3000';
  const targetClientType = String(clientType || 'ws').replace(/^\/+/, '') || 'ws';
  const frontendHost = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  const serializedParam = param == null || param === ''
    ? ''
    : typeof param === 'string'
      ? param
      : JSON.stringify(param);
  const query = serializedParam ? `?param=${encodeURIComponent(serializedParam)}` : '';
  const frontendHostUrl = `${scheme}://${frontendHost}:${apiPort}/${targetClientType}${query}`;
  const localhostUrl = `${scheme}://localhost:${apiPort}/${targetClientType}${query}`;
  const loopbackUrl = `${scheme}://127.0.0.1:${apiPort}/${targetClientType}${query}`;

  return Array.from(new Set([frontendHostUrl, localhostUrl, loopbackUrl]));
}

export default buildWsAttemptUrls;
