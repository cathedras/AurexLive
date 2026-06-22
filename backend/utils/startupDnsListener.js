const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { getConfiguredDnsAddress, getLocalFallbackAddress, writeDnsStatus } = require('./dnsStatusStore');

let dnsProcess = null;
let dnsMonitorTimer = null;
let dnsMonitorInFlight = false;
let dnsShutdownRequested = false;

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function shouldStartDnsListener() {
  if (process.env.COREDNS_AUTOSTART_IN_SERVER != null) {
    return isTruthy(process.env.COREDNS_AUTOSTART_IN_SERVER);
  }

  if (process.env.COREDNS_START_ON_BOOT != null) {
    return isTruthy(process.env.COREDNS_START_ON_BOOT);
  }

  return process.env.NODE_ENV === 'production' || isTruthy(process.env.USE_HTTPS);
}

function resolvePath(projectRoot, value) {
  if (!value) {
    return '';
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const item of interfaces[name] || []) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }

  return '127.0.0.1';
}

function getUsableLocalIPv4Address() {
  const address = getLocalIPv4Address();
  if (address && address !== '127.0.0.1') {
    return address;
  }

  return '';
}

function getDnsDomain() {
  return String(process.env.COREDNS_DOMAIN || 'www.auxm.com').trim() || 'www.auxm.com';
}

async function resolveDnsTargetIp() {
  const explicitTargetIp = String(process.env.COREDNS_TARGET_IP || '').trim();
  if (explicitTargetIp) {
    return explicitTargetIp;
  }

  return getLocalIPv4Address();
}

function getUpstreamResolvers() {
  const explicitResolvers = String(process.env.COREDNS_FORWARDERS || '').trim();
  if (explicitResolvers) {
    return explicitResolvers.split(/\s+/).filter(Boolean);
  }

  return ['223.5.5.5', '114.114.114.114'];
}

function getDefaultCorefileTemplate() {
  return [
    '.:53 {',
    '    errors',
    '    log',
    '    cache 30',
    '    forward . __FORWARDERS__',
    '}',
    '',
    '__DOMAIN__:53 {',
    '    hosts {',
    '        __LAN_IP__ __DOMAIN__',
    '        fallthrough',
    '    }',
    '    errors',
    '    log',
    '}',
    '',
  ].join('\n');
}

function loadCorefileTemplate(projectRoot) {
  const templatePath = resolvePath(projectRoot, process.env.COREDNS_TEMPLATE_PATH || path.join('backend', 'config', 'coredns', 'Corefile.template'));
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }

  return getDefaultCorefileTemplate();
}

function buildCorefile(domain, targetIp, upstreamResolvers, projectRoot) {
  const template = loadCorefileTemplate(projectRoot);
  const resolvers = upstreamResolvers.join(' ');

  return template
    .replace(/__DOMAIN__/g, domain)
    .replace(/__LAN_IP__/g, targetIp)
    .replace(/__FORWARDERS__/g, resolvers);
}

function probeTcpConnection(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (isReachable) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(Boolean(isReachable));
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function isNetworkReady() {
  const localAddress = getUsableLocalIPv4Address();
  if (!localAddress) {
    return false;
  }

  const forwarders = getUpstreamResolvers();
  const probeTimeoutMs = Number.parseInt(String(process.env.COREDNS_PROBE_TIMEOUT_MS || '2000'), 10);
  const safeProbeTimeoutMs = Number.isFinite(probeTimeoutMs) && probeTimeoutMs > 0 ? probeTimeoutMs : 2000;

  for (const forwarder of forwarders) {
    if (await probeTcpConnection(forwarder, 53, safeProbeTimeoutMs)) {
      return true;
    }
  }

  return false;
}

async function ensureCorefile(projectRoot) {
  const domain = getDnsDomain();
  const targetIp = await resolveDnsTargetIp();
  const upstreamResolvers = getUpstreamResolvers();
  const corednsDir = resolvePath(projectRoot, process.env.COREDNS_CONFIG_DIR || path.join('runtime', 'coredns'));
  const corefilePath = path.join(corednsDir, 'Corefile');
  const corefileContents = buildCorefile(domain, targetIp, upstreamResolvers, projectRoot);

  fs.mkdirSync(corednsDir, { recursive: true });
  fs.writeFileSync(corefilePath, corefileContents, 'utf8');

  return { domain, targetIp, corefilePath };
}

function terminateDnsProcess() {
  dnsShutdownRequested = true;
  if (dnsProcess && !dnsProcess.killed) {
    try {
      dnsProcess.kill();
    } catch {
      // ignore
    }
  }

  dnsProcess = null;
}

function stopDnsMonitor() {
  if (dnsMonitorTimer) {
    clearInterval(dnsMonitorTimer);
  }

  dnsMonitorTimer = null;
  dnsMonitorInFlight = false;
}

async function startCoreDnsProcess({ projectRoot, logger, corednsPath, detachChild = true, exitOnCoreDnsExit = false } = {}) {
  if (dnsProcess && !dnsProcess.killed) {
    return { started: true, reused: true };
  }

  const { domain, targetIp, corefilePath } = await ensureCorefile(projectRoot);
  const configuredAddress = getConfiguredDnsAddress({ domain, useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 });
  const fallbackAddress = getLocalFallbackAddress({ useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 });

  writeDnsStatus(projectRoot, {
    state: 'starting',
    domain,
    targetIp,
    configuredAddress,
    availableAddress: fallbackAddress,
    corefilePath,
    startedAt: new Date().toISOString(),
    message: 'CoreDNS process is starting.',
  }, {
    useHttps: process.env.USE_HTTPS,
    port: process.env.PORT || 3000,
  });

  const child = spawn(corednsPath, ['-conf', corefilePath], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dnsProcess = child;

  child.stdout.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      logger.info(`[CoreDNS] ${text}`, 'coredns');
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      logger.warning(`[CoreDNS] ${text}`, 'coredns');
    }
  });

  child.on('error', (error) => {
    dnsProcess = null;
    if (error && error.code === 'ENOENT') {
      stopDnsMonitor();
      writeDnsStatus(projectRoot, {
        state: 'error',
        domain,
        targetIp,
        configuredAddress,
        availableAddress: fallbackAddress,
        corefilePath,
        message: `CoreDNS executable was not found: ${corednsPath}`,
      }, {
        useHttps: process.env.USE_HTTPS,
        port: process.env.PORT || 3000,
      });
      logger.error(`[CoreDNS] CoreDNS executable was not found: ${corednsPath}`, 'coredns');
      return;
    }

    writeDnsStatus(projectRoot, {
      state: 'error',
      domain,
      targetIp,
      configuredAddress,
      availableAddress: fallbackAddress,
      corefilePath,
      message: `Failed to start CoreDNS: ${error.message}`,
    }, {
      useHttps: process.env.USE_HTTPS,
      port: process.env.PORT || 3000,
    });
    logger.warning(`[CoreDNS] Failed to start CoreDNS on startup: ${error.message}`, 'coredns');
  });

  child.on('exit', (code, signal) => {
    dnsProcess = null;
    if (code === 0) {
      logger.info('[CoreDNS] CoreDNS stopped normally.', 'coredns');
      writeDnsStatus(projectRoot, {
        state: dnsShutdownRequested ? 'stopped' : 'ready',
        domain,
        targetIp,
        configuredAddress,
        availableAddress: dnsShutdownRequested ? fallbackAddress : configuredAddress,
        corefilePath,
        message: dnsShutdownRequested ? 'CoreDNS stopped by shutdown request.' : 'CoreDNS stopped normally.',
      }, {
        useHttps: process.env.USE_HTTPS,
        port: process.env.PORT || 3000,
      });
      if (exitOnCoreDnsExit && !dnsShutdownRequested) {
        process.exit(1);
      }
      return;
    }

    logger.warning(`[CoreDNS] CoreDNS exited with code=${code} signal=${signal || 'none'} for ${domain} -> ${targetIp}`, 'coredns');
    writeDnsStatus(projectRoot, {
      state: 'error',
      domain,
      targetIp,
      configuredAddress,
      availableAddress: fallbackAddress,
      corefilePath,
      message: `CoreDNS exited with code=${code} signal=${signal || 'none'}`,
    }, {
      useHttps: process.env.USE_HTTPS,
      port: process.env.PORT || 3000,
    });
    if (exitOnCoreDnsExit && !dnsShutdownRequested) {
      process.exit(typeof code === 'number' && code !== 0 ? code : 1);
    }
  });

  if (typeof child.unref === 'function') {
    if (detachChild) {
      child.unref();
    }
  }

  logger.info(`[CoreDNS] Listening for ${domain} and forwarding to ${targetIp}. Corefile: ${corefilePath}`, 'coredns');
  return { started: true, domain, targetIp, corefilePath };
}

function ensureDnsMonitorCleanup() {
  if (ensureDnsMonitorCleanup.registered) {
    return;
  }

  ensureDnsMonitorCleanup.registered = true;
  process.once('exit', () => {
    stopDnsMonitor();
    terminateDnsProcess();
  });
  process.once('SIGINT', () => {
    dnsShutdownRequested = true;
    stopDnsMonitor();
    terminateDnsProcess();
  });
  process.once('SIGTERM', () => {
    dnsShutdownRequested = true;
    stopDnsMonitor();
    terminateDnsProcess();
  });
}

ensureDnsMonitorCleanup.registered = false;

async function maybeStartDnsListener({
  projectRoot,
  logger,
  corednsPath = process.env.COREDNS_PATH || 'coredns',
  detachChild = true,
  keepMonitorAttached = false,
  exitOnCoreDnsExit = false,
} = {}) {
  if (!shouldStartDnsListener()) {
    return { skipped: true, reason: 'disabled' };
  }

  if (dnsProcess && !dnsProcess.killed) {
    return { started: true, reused: true };
  }

  ensureDnsMonitorCleanup();

  const attemptStart = async () => {
    if (dnsProcess && !dnsProcess.killed) {
      stopDnsMonitor();
      return;
    }

    if (dnsMonitorInFlight) {
      return;
    }

    dnsMonitorInFlight = true;
    try {
      if (await isNetworkReady()) {
        if (!keepMonitorAttached) {
          stopDnsMonitor();
        }
        await startCoreDnsProcess({ projectRoot, logger, corednsPath, detachChild, exitOnCoreDnsExit });
      }
    } catch (error) {
      logger.warning(`[CoreDNS] Network readiness check failed: ${error.message}`, 'coredns');
    } finally {
      dnsMonitorInFlight = false;
    }
  };

  await attemptStart();
  if (!dnsProcess) {
    if (!dnsMonitorTimer) {
      dnsMonitorTimer = setInterval(attemptStart, 10000);
      if (!keepMonitorAttached && typeof dnsMonitorTimer.unref === 'function') {
        dnsMonitorTimer.unref();
      }
    }

    const domain = getDnsDomain();
    const targetIp = getUsableLocalIPv4Address() || getLocalFallbackAddress({ useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 });
    writeDnsStatus(projectRoot, {
      state: 'waiting-network',
      domain,
      targetIp,
      configuredAddress: getConfiguredDnsAddress({ domain, useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
      availableAddress: getLocalFallbackAddress({ useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
      message: 'Waiting for network readiness before starting CoreDNS.',
    }, {
      useHttps: process.env.USE_HTTPS,
      port: process.env.PORT || 3000,
    });

    logger.info('[CoreDNS] Waiting for network readiness before enabling www.auxm.com. Until then, the site stays localhost-only.', 'coredns');
    return { monitoring: true, reason: 'waiting-for-network' };
  }

  return { started: true };
}

module.exports = {
  maybeStartDnsListener,
};