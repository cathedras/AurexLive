const path = require('path');
const { createLogger } = require('./middleware/logger');
const { maybeStartDnsListener } = require('./utils/startupDnsListener');
const { writeDnsStatus, getLocalFallbackAddress, getConfiguredDnsAddress } = require('./utils/dnsStatusStore');

const logger = createLogger({ source: 'dns-service' });
const projectRoot = path.resolve(__dirname, '..');

if (process.env.COREDNS_AUTOSTART_IN_SERVER == null) {
  process.env.COREDNS_AUTOSTART_IN_SERVER = '1';
}

async function bootstrap() {
  const initialDomain = String(process.env.COREDNS_DOMAIN || 'www.auxm.com').trim() || 'www.auxm.com';
  const initialTargetIp = String(process.env.COREDNS_TARGET_IP || '').trim() || 'pending';
  writeDnsStatus(projectRoot, {
    state: 'starting',
    domain: initialDomain,
    targetIp: initialTargetIp,
    configuredAddress: getConfiguredDnsAddress({ domain: initialDomain, useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
    availableAddress: getLocalFallbackAddress({ useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
    message: 'DNS service is booting under PM2.',
    startedAt: new Date().toISOString(),
  }, {
    useHttps: process.env.USE_HTTPS,
    port: process.env.PORT || 3000,
  });

  const result = await maybeStartDnsListener({
    projectRoot,
    logger,
    detachChild: false,
    keepMonitorAttached: true,
    exitOnCoreDnsExit: true,
  });

  if (result && result.skipped && result.reason === 'disabled') {
    writeDnsStatus(projectRoot, {
      state: 'disabled',
      domain: initialDomain,
      targetIp: initialTargetIp,
      configuredAddress: getConfiguredDnsAddress({ domain: initialDomain, useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
      availableAddress: getLocalFallbackAddress({ useHttps: process.env.USE_HTTPS, port: process.env.PORT || 3000 }),
      message: 'DNS service disabled by environment.',
    }, {
      useHttps: process.env.USE_HTTPS,
      port: process.env.PORT || 3000,
    });
    logger.info('[CoreDNS] DNS service disabled by environment.', 'dns-service');
    process.exit(0);
  }

  logger.info('[CoreDNS] DNS service started under PM2; use `pm2 logs dns-service` to view startup output.', 'dns-service');
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error : new Error(String(error)), 'dns-service');
  process.exit(1);
});