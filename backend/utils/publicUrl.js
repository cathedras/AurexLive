function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function parseUrl(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function getConfiguredPublicBaseUrl() {
  return normalizeBaseUrl(process.env.PUBLIC_BASE_URL || process.env.MOBILE_BASE_URL || '');
}

function getPublicHttpOrigin({ useHttps = false, port = 3000, fallbackHost = 'localhost' } = {}) {
  const configuredBaseUrl = getConfiguredPublicBaseUrl();
  if (configuredBaseUrl) {
    const parsed = parseUrl(configuredBaseUrl);
    return parsed ? parsed.origin : configuredBaseUrl;
  }

  const protocol = useHttps ? 'https' : 'http';
  return `${protocol}://${fallbackHost}:${port}`;
}

function getPublicWebSocketOrigin({ useHttps = false, port = 3000, fallbackHost = 'localhost' } = {}) {
  const configuredBaseUrl = getConfiguredPublicBaseUrl();
  if (configuredBaseUrl) {
    const parsed = parseUrl(configuredBaseUrl);
    if (parsed) {
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${parsed.host}`;
    }

    if (/^https?:\/\//i.test(configuredBaseUrl)) {
      return configuredBaseUrl.replace(/^http/, 'ws');
    }

    if (/^wss?:\/\//i.test(configuredBaseUrl)) {
      return configuredBaseUrl;
    }
  }

  const protocol = useHttps ? 'wss' : 'ws';
  return `${protocol}://${fallbackHost}:${port}`;
}

module.exports = {
  normalizeBaseUrl,
  getConfiguredPublicBaseUrl,
  getPublicHttpOrigin,
  getPublicWebSocketOrigin,
};