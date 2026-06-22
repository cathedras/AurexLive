const fs = require('fs');
const path = require('path');

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function resolvePath(projectRoot, value) {
  if (!value) {
    return '';
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function getDnsRuntimeDir(projectRoot) {
  return resolvePath(projectRoot, process.env.COREDNS_STATUS_DIR || path.join('runtime', 'coredns'));
}

function getDnsStatusFilePath(projectRoot) {
  return path.join(getDnsRuntimeDir(projectRoot), 'status.json');
}

function getLocalFallbackAddress({ useHttps = false, port = process.env.PORT || 3000 } = {}) {
  const scheme = isTruthyFlag(useHttps) ? 'https' : 'http';
  return `${scheme}://localhost:${port}`;
}

function getConfiguredDnsAddress({ domain, useHttps = false, port = process.env.PORT || 3000 } = {}) {
  const configured = String(process.env.MOBILE_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const scheme = isTruthyFlag(useHttps) ? 'https' : 'http';
  return `${scheme}://${domain || 'www.auxm.com'}`;
}

function normalizeDnsStatus(nextStatus = {}, defaults = {}) {
  const useHttps = isTruthyFlag(defaults.useHttps);
  const port = defaults.port || process.env.PORT || 3000;
  const domain = String(nextStatus.domain || defaults.domain || process.env.COREDNS_DOMAIN || 'www.auxm.com').trim() || 'www.auxm.com';
  const targetIp = String(nextStatus.targetIp || defaults.targetIp || '').trim();
  const state = String(nextStatus.state || 'unknown').trim() || 'unknown';
  const configuredAddress = String(nextStatus.configuredAddress || defaults.configuredAddress || getConfiguredDnsAddress({ domain, useHttps, port })).trim();
  const availableAddress = String(nextStatus.availableAddress || defaults.availableAddress || (state === 'ready' ? configuredAddress : getLocalFallbackAddress({ useHttps, port }))).trim();

  return {
    serviceName: 'dns-service',
    state,
    domain,
    targetIp,
    configuredAddress,
    availableAddress,
    corefilePath: String(nextStatus.corefilePath || defaults.corefilePath || '').trim(),
    message: String(nextStatus.message || defaults.message || '').trim(),
    startedAt: nextStatus.startedAt || defaults.startedAt || null,
    updatedAt: nextStatus.updatedAt || new Date().toISOString(),
  };
}

function writeDnsStatus(projectRoot, nextStatus = {}, defaults = {}) {
  const statusFilePath = getDnsStatusFilePath(projectRoot);
  const statusDir = path.dirname(statusFilePath);
  fs.mkdirSync(statusDir, { recursive: true });

  const status = normalizeDnsStatus(nextStatus, defaults);
  fs.writeFileSync(statusFilePath, JSON.stringify(status, null, 2), 'utf8');
  return status;
}

function readDnsStatus(projectRoot, defaults = {}) {
  const statusFilePath = getDnsStatusFilePath(projectRoot);
  if (!fs.existsSync(statusFilePath)) {
    return normalizeDnsStatus({ state: 'missing', message: 'DNS service status not found yet.' }, defaults);
  }

  try {
    const rawText = fs.readFileSync(statusFilePath, 'utf8');
    const parsed = JSON.parse(rawText);
    return normalizeDnsStatus(parsed, defaults);
  } catch (error) {
    return normalizeDnsStatus({
      state: 'error',
      message: `Failed to read DNS status: ${error.message}`,
    }, defaults);
  }
}

module.exports = {
  isTruthyFlag,
  getDnsRuntimeDir,
  getDnsStatusFilePath,
  getLocalFallbackAddress,
  getConfiguredDnsAddress,
  normalizeDnsStatus,
  writeDnsStatus,
  readDnsStatus,
};