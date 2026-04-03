const fs = require('fs');
const path = require('path');
const { installGlobalLogger } = require('./middleware/logger');

installGlobalLogger();

const recordingService = require('./services/recordingService');
const { createLogger } = require('./middleware/logger');

const logger = createLogger({ source: 'monitorWorker' });

const monitorsPath = path.resolve(__dirname, '..', 'runtime', 'monitors.json');

function ensureMonitorsFile() {
  const dir = path.dirname(monitorsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(monitorsPath)) fs.writeFileSync(monitorsPath, '[]', 'utf8');
}

let active = new Map(); // clientId -> entry

function readMonitorsFile() {
  try {
    const raw = fs.readFileSync(monitorsPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    logger.error(`monitorWorker: failed to read monitors file ${e && e.message ? e.message : e}`, 'readMonitorsFile');
    return [];
  }
}

function syncMonitors() {
  const list = readMonitorsFile();
  const wanted = new Map(list.map(item => [String(item.clientId), item]));

  // start missing
  for (const [clientId, item] of wanted) {
    if (!active.has(clientId)) {
      try {
        logger.info(`monitorWorker: starting monitor for ${clientId} ${item.device || 'default'}`, 'syncMonitors');
        recordingService.startVolumeMonitor(clientId, item.device);
        active.set(clientId, item);
      } catch (e) {
        logger.error(`monitorWorker: failed to start monitor for ${clientId} ${e && e.message ? e.message : e}`, 'syncMonitors');
      }
    }
  }

  // stop removed
  for (const [clientId] of active) {
    if (!wanted.has(clientId)) {
      try {
        logger.info(`monitorWorker: stopping monitor for ${clientId}`, 'syncMonitors');
        recordingService.stopVolumeMonitor(clientId);
      } catch (e) {
        logger.error(`monitorWorker: failed to stop monitor for ${clientId} ${e && e.message ? e.message : e}`, 'syncMonitors');
      }
      active.delete(clientId);
    }
  }
}

function watchFile() {
  try {
    fs.watchFile(monitorsPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        try { syncMonitors(); } catch (e) { logger.error(`monitorWorker: sync error ${e && e.message ? e.message : e}`, 'watchFile'); }
      }
    });
  } catch (e) {
    // fallback to polling
    setInterval(() => {
      try { syncMonitors(); } catch (err) { logger.error(`monitorWorker: sync error ${err && err.message ? err.message : err}`, 'watchFile'); }
    }, 2000);
  }
}

function shutdown() {
  logger.info('monitorWorker: shutting down, stopping monitors...', 'shutdown');
  for (const [clientId] of active) {
    try { recordingService.stopVolumeMonitor(clientId); } catch (e) {}
  }
  active.clear();
  process.exit(0);
}

function main() {
  ensureMonitorsFile();
  syncMonitors();
  watchFile();

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    logger.error(err && err.stack ? err.stack : `monitorWorker: uncaughtException ${String(err)}`, 'main');
    // allow PM2 to restart the worker
    process.exit(1);
  });
}

main();
