const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const path = require('path');
const recordingService = require('./services/recordingService');
const wsClientService = require('./services/wsClientService');

const monitorsPath = path.resolve(__dirname, '..', 'runtime', 'monitors.json');

function ensureMonitorsFile() {
  try {
    const dir = path.dirname(monitorsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(monitorsPath)) fs.writeFileSync(monitorsPath, '[]', 'utf8');
  } catch (e) { console.error('wsServer: ensureMonitorsFile error', e && e.message); }
}

function readMonitorsFile() {
  try {
    ensureMonitorsFile();
    const raw = fs.readFileSync(monitorsPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('wsServer: failed to read monitors file', e && e.message);
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
    console.error('wsServer: failed to write monitors file', e && e.message);
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
      console.log('WebSocket 地址: ws://localhost:3000');
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
      console.log(`[WS] new connection from ${remote} path=${rpath}`)
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

    // If this client declared a type starting with 'volume', start a monitoring ffmpeg process
    try {
      const client = wsClientService.clients.get(clientId);
      if (client && client.typeMain === 'volume') {
        const device = client.typeSub || null; // allow client to request specific device via type suffix
        // start monitor immediately and persist intent so monitorWorker can restore on restart
        const res = recordingService.startVolumeMonitor(clientId, device);
        safeSend(ws, { type: 'monitor-start', data: res });
        try { addMonitorEntry(clientId, device); } catch (e) { console.error('wsServer: addMonitorEntry error', e && e.message); }
        console.log(`[WS] started volume monitor for client ${clientId} device=${device} res=${JSON.stringify(res)}`);
      }
    } catch (e) { }

    // note: ws 'message' callback signature: (message, isBinary)
    ws.on('message', async (message, isBinary) => {
      // 支持二进制和文本 — 增加日志以便诊断客户端发送但服务端未接收的问题
      try {
        console.log('[WS] raw message received, isBuffer=', Buffer.isBuffer(message), 'len=', Buffer.isBuffer(message) ? message.length : (message && message.toString ? String(message).length : 'n/a'))
      } catch (e) {}

      let payload = null;
      // Only treat as binary when the isBinary flag is true. Some text frames may
      // arrive as Buffer objects but are not binary frames per the ws flag.
      if (isBinary) {
        // 若收到二进制，直接当作音频 chunk（二进制）需要额外约定字段，跳过自动处理
        console.log('[WS] binary frame received (isBinary=true) length=', Buffer.isBuffer(message) ? message.length : 'n/a')
        return;
      }

      try {
        // If the frame is binary (isBinary === true) treat as binary chunk.
        if (isBinary) {
          // Treat binary frames as raw audio chunks: measure volume and broadcast to clients.
          try {
            const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
            let volume = null;
            try {
              volume = recordingService.calculateVolume(buf);
            } catch (e) {
              // calculateVolume may fail for encoded containers; ignore and leave volume=null
            }

            const volPayload = { clientId, volume, timestamp: Date.now() };
            // Broadcast volume to all connected clients
            try { recordingService.broadcastVolume(volPayload); } catch (e) {}
          } catch (e) {
            // ignore processing errors but log
            console.warn('[WS] failed to process binary frame', e && e.message ? e.message : e);
          }
          return;
        }

        const text = (typeof message === 'string') ? message : message.toString();
        payload = JSON.parse(text);
      } catch (e) {
        // If message is not JSON, treat it as raw text and handle as a demo echo
        const text = (typeof message === 'string') ? message : (message && message.toString ? message.toString() : '');
        payload = { type: 'raw', data: text };
      }

      const { type, data } = payload || {};
      console.log('[WS]', type, data);
      try {
        if (type === 'identify') {
          const { clientType } = data || {};
          wsClientService.setClientType(clientId, clientType);
          safeSend(ws, { type: 'identify-result', success: true });
          return;
        }
        if (type === 'subscribe-volume') {
          const { fileName } = data || {};
          if (fileName) {
            // 存储客户端订阅的录音文件
            const client = wsClientService.clients.get(clientId);
            if (client) {
              client.subscribedFile = fileName;
            }
            safeSend(ws, { type: 'subscribe-volume-result', success: true, fileName });
            console.log(`[WS] client ${clientId} subscribed to volume for ${fileName}`);
          } else {
            safeSend(ws, { type: 'subscribe-volume-result', success: false, error: 'missing_fileName' });
          }
          return;
        }
        if (type === 'add-chunk') {
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
      console.log(`[WS] client ${clientId} disconnected code=${code} reason=${reason && reason.toString ? reason.toString() : reason}`)
      try {
        recordingService.stopVolumeMonitor(clientId);
      } catch (e) {}
      try { removeMonitorEntry(clientId); } catch (e) { console.error('wsServer: removeMonitorEntry error', e && e.message); }
    })
    ws.on('error', (err) => {
      console.warn(`[WS] client ${clientId} error:`, err && err.message ? err.message : err)
    })
  });

  wss.on('error', (err) => {
    console.error('[WS] server error', err)
  })
};
