const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function resolvePath(projectRoot, value) {
  if (!value) {
    return '';
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function getStepRenewalArgs(projectRoot) {
  const certPath = resolvePath(projectRoot, process.env.SSL_CERT_PATH || '');
  const keyPath = resolvePath(projectRoot, process.env.SSL_KEY_PATH || '');

  if (!certPath || !keyPath) {
    return null;
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    return null;
  }

  const args = [
    'ca',
    'renew',
    '--force',
    `--expires-in=${String(process.env.STEP_CA_RENEW_EXPIRES_IN || '720h').trim()}`,
  ];

  if (isTruthy(process.env.STEP_CA_RENEW_MTLS === undefined ? 'true' : process.env.STEP_CA_RENEW_MTLS)) {
    // Default behavior uses the certificate for renewal authentication.
  } else {
    args.push('--mtls=false');
  }

  if (String(process.env.STEP_CA_URL || '').trim()) {
    args.push('--ca-url', String(process.env.STEP_CA_URL).trim());
  }

  const rootPath = String(process.env.STEP_CA_ROOT_PATH || '').trim();
  if (rootPath) {
    args.push('--root', resolvePath(projectRoot, rootPath));
  }

  args.push(certPath, keyPath);
  return { args, certPath, keyPath };
}

function shouldRunStartupRenewal() {
  if (process.env.STEP_CA_RENEW_ON_START != null) {
    return isTruthy(process.env.STEP_CA_RENEW_ON_START);
  }

  return isTruthy(process.env.USE_HTTPS);
}

function isNoRenewalOutput(output) {
  return /certificate not renewed|expires in|too early/i.test(String(output || ''));
}

async function maybeRenewCertificateOnStartup({ projectRoot, logger, stepCliPath = process.env.STEP_CLI_PATH || 'step' } = {}) {
  if (!shouldRunStartupRenewal()) {
    return { skipped: true, reason: 'disabled' };
  }

  const renewal = getStepRenewalArgs(projectRoot);
  if (!renewal) {
    logger.info('[HTTPS] Startup certificate renewal skipped because SSL_CERT_PATH / SSL_KEY_PATH were not available.', 'startup-renewal');
    return { skipped: true, reason: 'missing-cert-paths' };
  }

  const result = spawnSync(stepCliPath, renewal.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const combinedOutput = [stdout, stderr].filter(Boolean).join('\n').trim();

  if (result.error) {
    logger.warning(`[HTTPS] step-cli startup renewal could not run: ${result.error.message}`, 'startup-renewal');
    return { skipped: true, reason: 'execution-error', error: result.error };
  }

  if (result.status === 0) {
    if (combinedOutput) {
      logger.info(`[HTTPS] step-cli startup renewal finished: ${combinedOutput}`, 'startup-renewal');
    } else {
      logger.info('[HTTPS] step-cli startup renewal finished.', 'startup-renewal');
    }
    return { renewed: true };
  }

  if (isNoRenewalOutput(combinedOutput)) {
    logger.info('[HTTPS] step-cli startup renewal skipped because the certificate is still valid.', 'startup-renewal');
    return { skipped: true, reason: 'not-needed' };
  }

  logger.warning(`[HTTPS] step-cli startup renewal failed, the backend will continue using the existing certificate. ${combinedOutput || result.status}`, 'startup-renewal');
  return { skipped: true, reason: 'failed', output: combinedOutput };
}

module.exports = {
  maybeRenewCertificateOnStartup,
};