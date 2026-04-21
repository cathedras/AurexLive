// Build WS attempt URLs for given path param (e.g. 'volume-binary')
export function buildWsAttemptUrls(param) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const apiPort = import.meta.env.VITE_API_PORT || '3000';
  const host = location.hostname || 'localhost';

  const suffix = param ? `/${param}` : '';
  const sameOriginUrl = `${scheme}://${location.host}/ws${suffix}`;
  const apiHostUrl = `${scheme}://${host}:${apiPort}/ws${suffix}`;
  const isLocalFrontend = ['localhost', '127.0.0.1', '::1'].includes(host);
  const shouldPreferApiHost = isLocalFrontend && String(location.port || '') !== String(apiPort);

  return Array.from(new Set(shouldPreferApiHost ? [apiHostUrl, sameOriginUrl] : [sameOriginUrl, apiHostUrl]));
}

export default buildWsAttemptUrls;
