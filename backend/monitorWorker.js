const fs = require('fs');
const path = require('path');
const recordingService = require('./services/recordingService');

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
    console.error('monitorWorker: failed to read monitors file', e && e.message);
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
        console.log('monitorWorker: starting monitor for', clientId, item.device || 'default');
        recordingService.startVolumeMonitor(clientId, item.device);
        active.set(clientId, item);
      } catch (e) {
        console.error('monitorWorker: failed to start monitor for', clientId, e && e.message);
      }
    }
  }

  // stop removed
  for (const [clientId] of active) {
    if (!wanted.has(clientId)) {
      try {
        console.log('monitorWorker: stopping monitor for', clientId);
        recordingService.stopVolumeMonitor(clientId);
      } catch (e) {
        console.error('monitorWorker: failed to stop monitor for', clientId, e && e.message);
      }
      active.delete(clientId);
    }
  }
}

function watchFile() {
  try {
    fs.watchFile(monitorsPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        try { syncMonitors(); } catch (e) { console.error('monitorWorker: sync error', e && e.message); }
      }
    });
  } catch (e) {
    // fallback to polling
    setInterval(() => {
      try { syncMonitors(); } catch (err) { console.error('monitorWorker: sync error', err && err.message); }
    }, 2000);
  }
}

function shutdown() {
  console.log('monitorWorker: shutting down, stopping monitors...');
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
    console.error('monitorWorker: uncaughtException', err && err.stack || err);
    // allow PM2 to restart the worker
    process.exit(1);
  });
}

main();
