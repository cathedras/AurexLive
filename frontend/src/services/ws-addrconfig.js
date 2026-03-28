// Build WS attempt URLs for given path param (e.g. 'volume-binary')
export function buildWsAttemptUrls(param) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const apiPort = import.meta.env.VITE_API_PORT || '3000';
  const host = location.hostname || 'localhost';

  const suffix = param ? `/${param}` : '';

  return [
    `${scheme}://${host}:${apiPort}${suffix}`,
    `${scheme}://${location.host}${suffix}`,
    `${scheme}://${location.hostname}${suffix}`
  ];
}

export default buildWsAttemptUrls;
