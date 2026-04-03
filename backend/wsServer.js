const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const recordingService = require('./services/recordingService');
const wsClientService = require('./services/wsClientService');
const { createLogger } = require('./middleware/logger');

const logger = createLogger({ source: 'initWebSocket' });

const monitorsPath = path.resolve(__dirname, '..', 'runtime', 'monitors.json');

function ensureMonitorsFile() {
  try {
    const dir = path.dirname(monitorsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(monitorsPath)) fs.writeFileSync(monitorsPath, '[]', 'utf8');
  } catch (e) { logger.error(`wsServer: ensureMonitorsFile error ${e && e.message ? e.message : e}`, 'ensureMonitorsFile'); }
}

function readMonitorsFile() {
  try {
    ensureMonitorsFile();
    const raw = fs.readFileSync(monitorsPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    logger.error(`wsServer: failed to read monitors file ${e && e.message ? e.message : e}`, 'readMonitorsFile');
    return [];
  }
}

function writeMonitorsFile(list) {
  try {
    const tmp = monitorsPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, monitorsPath);
    return true;
  } catch (e) {
    logger.error(`wsServer: failed to write monitors file ${e && e.message ? e.message : e}`, 'writeMonitorsFile');
    return false;
  }
}

function addMonitorEntry(clientId, device) {
  const list = readMonitorsFile();
  const existing = list.find(it => String(it.clientId) === String(clientId));
  if (existing) return false;
  list.push({ clientId: String(clientId), device: device || null, startedAt: Date.now() });
  return writeMonitorsFile(list);
}

function removeMonitorEntry(clientId) {
  const list = readMonitorsFile();
  const filtered = list.filter(it => String(it.clientId) !== String(clientId));
  if (filtered.length === list.length) return false;
  return writeMonitorsFile(filtered);
}

module.exports = function initWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  // Print WebSocket endpoints once the HTTP server is listening
  function printEndpoints() {
    try {
      const addr = server.address();
      const port = addr && addr.port ? addr.port : process.env.PORT || 3000;
      const nets = os.networkInterfaces();
      const addrs = new Set();
      addrs.add('localhost');
      addrs.add('127.0.0.1');
      Object.values(nets).forEach((ifaceArr) => {
        ifaceArr.forEach((iface) => {
          if (iface.family === 'IPv4' && !iface.internal) {
            addrs.add(iface.address);
          }
        });
      });
      console.log('WebSocket endpoints:');
      addrs.forEach((a) => {
        console.log(`  ws://${a}:${port}`);
      });
      console.log('Note: if front-end is served over HTTPS use wss:// and configure TLS/proxy accordingly.');
    } catch (e) {
      logger.info('WebSocket 地址: ws://localhost:3000', 'printEndpoints');
    }
  }

  if (server && server.listening) {
    printEndpoints();
  } else if (server && server.on) {
    server.on('listening', printEndpoints);
  }

  // Helper to safely send JSON over a ws connection
  function safeSend(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {}
  }

  wss.on('connection', (ws, req) => {
    // log remote address and request path for debugging
    try {
      const remote = req && req.socket ? req.socket.remoteAddress : 'unknown'
      const rpath = req && req.url ? req.url : '/'
      logger.info(`[WS] new connection from ${remote} path=${rpath}`, 'connection')
    } catch (e) {}

    // 注册客户端并绑定消息处理（由 wsClientService 管理）
    const clientId = wsClientService.registerClient(ws);
    // Determine client type from request path (strip leading '/') and store it
    try {
      const reqPath = req && req.url ? req.url : '/';
      const clientType = String(reqPath).replace(/^\//, '') || 'default';
      wsClientService.setClientType(clientId, clientType);
    } catch (e) {}
    // 发送客户端ID给前端
    safeSend(ws, { type: 'clientId', data: clientId });

    // note: ws 'message' callback signature: (message, isBinary)
    ws.on('message', async (message, isBinary) => {
      // 支持二进制和文本 — 增加日志以便诊断客户端发送但服务端未接收的问题
      try {
        logger.info(`raw message received, isBuffer=${Buffer.isBuffer(message)} len=${Buffer.isBuffer(message) ? message.length : (message && message.toString ? String(message).length : 'n/a')}`, 'message')
      } catch (e) {}
      const payload = isBinary ? message : (message && message.toString ? message.toString() : '');
      logger.info(`payload after processing, content=${payload} isBinary=${isBinary} len=${payload && payload.length ? payload.length : 'n/a'}`, 'message');

      let parsedPayload = payload;
      if (!isBinary && typeof payload === 'string') {
        try {
          parsedPayload = JSON.parse(payload);
        } catch (parseErr) {
          logger.warning(`failed to parse JSON payload: ${parseErr && parseErr.message ? parseErr.message : parseErr}`, 'message');
        }
      }

      const { type, data } = parsedPayload || {};
      logger.info(`message parsed, type=${type} data=${JSON.stringify(data)}`, 'message');
      try {
        if (type === 'identify') {
          const { clientType } = data || {};
          wsClientService.setClientType(clientId, clientType);
          safeSend(ws, { type: 'identify-result', success: true });
          return;
        }
        if (type === 'subscribe-volume') {
          const { fileName, device } = data || {};
          if (fileName) {
            // 存储客户端订阅的录音文件
            const client = wsClientService.clients.get(clientId);
            if (client) {
              client.subscribedFile = fileName;
            }
            safeSend(ws, { type: 'subscribe-volume-result', success: true, fileName });
            logger.info(`client ${clientId} subscribed to volume for ${fileName}`, 'message');
                // If this client declared a type starting with 'volume', start a monitoring ffmpeg process
            try {
                const monitorDevice = device || (client && client.typeSub) || null; // allow client to request specific device via message or type suffix
                // start monitor immediately and persist intent so monitorWorker can restore on restart
                const res = recordingService.startVolumeMonitor(clientId, monitorDevice);
                safeSend(ws, { type: 'monitor-start', data: res });
                try { addMonitorEntry(clientId, monitorDevice); } catch (e) { logger.error(`wsServer: addMonitorEntry error ${e && e.message ? e.message : e}`, 'addMonitorEntry'); }
                logger.info(`started volume monitor for client ${clientId} device=${monitorDevice} res=${JSON.stringify(res)}`, 'message');
            } catch (e) {
              logger.warning(`failed to start volume monitor for client ${clientId}: ${e && e.message ? e.message : e}`, 'message');
            }

          } else {
            safeSend(ws, { type: 'subscribe-volume-result', success: false, error: 'missing_fileName' });
          }
          return;
        } else if (type === 'add-chunk') {
          // data: { fileName, chunkBase64 }
          const { fileName, chunkBase64 } = data || {};
          if (fileName && chunkBase64) {
            const buf = Buffer.from(chunkBase64, 'base64');
            recordingService.addRecordingChunk(fileName, buf);
            safeSend(ws, { type: 'add-chunk-result', success: true });
          } else {
            safeSend(ws, { type: 'add-chunk-result', success: false, error: 'missing_params' });
          }
        } else if (type === 'get-status') {
          const { fileName } = data || {};
          const status = recordingService.getStatus(fileName);
          safeSend(ws, { type: 'get-status-result', success: true, data: status });
        } else if (type === 'echo' || type === 'raw') {
          // Demo: echo back the received data to the client
          safeSend(ws, { type: 'echo', success: true, data });
        }
      } catch (err) {
        safeSend(ws, { type: `${type}-result`, success: false, error: err.message });
      }
    });
    ws.on('close', (code, reason) => {
      logger.info(`client ${clientId} disconnected code=${code} reason=${reason && reason.toString ? reason.toString() : reason}`, 'close')
      try {
        recordingService.stopVolumeMonitor(clientId);
      } catch (e) {}
      try { removeMonitorEntry(clientId); } catch (e) { logger.error(`wsServer: removeMonitorEntry error ${e && e.message ? e.message : e}`, 'removeMonitorEntry'); }
    })
    ws.on('error', (err) => {
      logger.warning(`client ${clientId} error: ${err && err.message ? err.message : err}`, 'error')
    })
  });

  wss.on('error', (err) => {
    logger.error(err instanceof Error ? err : `[WS] server error ${String(err)}`, 'server')
  })
};
