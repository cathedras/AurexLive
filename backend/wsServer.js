const WebSocket = require('ws');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const recordingService = require('./services/recordingService');
const wsClientService = require('./services/wsClientService');
const { createLogger } = require('./middleware/logger');

const logger = createLogger({ source: 'initWebSocket' });
const VOLUME_MONITOR_START_DELAY_MS = 0;

function normalizeClientType(requestPath) {
  const rawPath = String(requestPath || '/').split('?')[0].replace(/^\/+/, '');
  if (!rawPath) {
    return 'default';
  }

  if (rawPath.startsWith('ws/')) {
    return rawPath.slice(3) || 'default';
  }

  if (rawPath === 'ws') {
    return 'default';
  }

  return rawPath;
}

module.exports = function initWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const publicWsScheme = String(process.env.PUBLIC_WS_PROTOCOL || '').trim() || (server instanceof https.Server ? 'wss' : 'ws');

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
        console.log(`  ${publicWsScheme}://${a}:${port}`);
      });
      console.log(`Note: if front-end is served over HTTPS use ${publicWsScheme === 'wss' ? 'wss://' : 'ws://'} and configure TLS/proxy accordingly.`);
    } catch (e) {
      logger.info(`WebSocket URL: ${publicWsScheme}://localhost:3000`, 'printEndpoints');
    }
  }

  if (server && server.listening) {
    printEndpoints();
  } else if (server && server.on) {
    server.on('listening', printEndpoints);
  }

  // Helper to safely send JSON over a WS connection
  function safeSend(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {}
  }

  wss.on('connection', (ws, req) => {
    // Log the remote address and request path for debugging
    try {
      const remote = req && req.socket ? req.socket.remoteAddress : 'unknown'
      const rpath = req && req.url ? req.url : '/'
      logger.info(`[WS] new connection from ${remote} path=${rpath}`, 'connection')
    } catch (e) {}

    // Register the client and bind message handling (managed by wsClientService)
    const clientId = wsClientService.registerClient(ws);
    // Determine the client type from the request path (strip the leading '/') and store it
    try {
      const reqPath = req && req.url ? req.url : '/';
      const clientType = normalizeClientType(reqPath);
      wsClientService.setClientType(clientId, clientType);
    } catch (e) {}
    // Send the client ID to the frontend
    safeSend(ws, { type: 'clientId', data: clientId });

    // note: ws 'message' callback signature: (message, isBinary)
    ws.on('message', async (message, isBinary) => {
      // Support binary and text payloads; add logs to diagnose cases where the client sends data but the server does not receive it
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
            // Store the recording file subscribed to by the client
            const client = wsClientService.clients.get(clientId);
            if (client) {
              client.subscribedFile = fileName;
            }
            safeSend(ws, { type: 'subscribe-volume-result', success: true, fileName });
            logger.info(`client ${clientId} subscribed to volume for ${fileName}`, 'message');
            try {
              const monitorDevice = device || (client && client.typeSub) || null; // allow client to request specific device via message or type suffix
              const startTimer = setTimeout(() => {
                const currentClient = wsClientService.clients.get(clientId);
                if (!currentClient || !currentClient.ws || currentClient.ws.readyState !== WebSocket.OPEN) {
                  return;
                }

                try {
                  const res = recordingService.startVolumeMonitor(clientId, monitorDevice);
                  safeSend(ws, { type: 'monitor-start', data: res });
                  logger.info(`started volume monitor for client ${clientId} device=${monitorDevice} res=${JSON.stringify(res)}`, 'message');
                } catch (e) {
                  logger.warning(`failed to start volume monitor for client ${clientId}: ${e && e.message ? e.message : e}`, 'message');
                }
              }, VOLUME_MONITOR_START_DELAY_MS);

              if (client) {
                if (client.pendingVolumeMonitorTimer) {
                  clearTimeout(client.pendingVolumeMonitorTimer);
                }
                client.pendingVolumeMonitorTimer = startTimer;
              }
            } catch (e) {
              logger.warning(`failed to start volume monitor for client ${clientId}: ${e && e.message ? e.message : e}`, 'message');
            }

          } else {
            safeSend(ws, { type: 'subscribe-volume-result', success: false, error: 'missing_fileName' });
          }
          return;
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
        const client = wsClientService.clients.get(clientId);
        if (client && client.pendingVolumeMonitorTimer) {
          clearTimeout(client.pendingVolumeMonitorTimer);
          client.pendingVolumeMonitorTimer = null;
        }
        recordingService.stopVolumeMonitor(clientId);
      } catch (e) {}
    })
    ws.on('error', (err) => {
      logger.warning(`client ${clientId} error: ${err && err.message ? err.message : err}`, 'error')
    })
  });

  wss.on('error', (err) => {
    logger.error(err instanceof Error ? err : `[WS] server error ${String(err)}`, 'server')
  })
};
