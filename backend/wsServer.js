const WebSocket = require('ws');
const recordingService = require('./services/recordingService');
const wsClientService = require('./services/wsClientService');

module.exports = function initWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  // Helper to safely send JSON over a ws connection
  function safeSend(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {}
  }

  wss.on('connection', (ws) => {
    // 注册客户端并绑定消息处理（由 wsClientService 管理）
    const clientId = wsClientService.registerClient(ws);
    // 发送客户端ID给前端
    safeSend(ws, { type: 'clientId', data: clientId });

    ws.on('message', async (message) => {
      // 支持二进制和文本
      let payload = null;
      if (Buffer.isBuffer(message)) {
        // 若收到二进制，直接当作音频 chunk（二进制）需要额外约定字段，跳过自动处理
        // 可扩展：将二进制 chunk 与元数据组合发送
        return;
      }

      try {
        payload = JSON.parse(message.toString());
      } catch (e) {
        safeSend(ws, { type: 'error', data: 'invalid_json' });
        return;
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
        if (type === 'start-backend') {
          const { device, outFileName, ffmpegArgs } = data || {};
          const info = recordingService.startRecordingWithFfmpeg(clientId, ffmpegArgs, outFileName || null);
          safeSend(ws, { type: 'start-backend-result', success: true, data: info });
        } else if (type === 'stop-recording') {
          const { fileName } = data || {};
          const info = recordingService.stopRecording(fileName);
          safeSend(ws, { type: 'stop-recording-result', success: true, data: info });
        } else if (type === 'start-recording') {
          const info = recordingService.startRecording(clientId);
          safeSend(ws, { type: 'start-recording-result', success: true, data: info });
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
        }
      } catch (err) {
        safeSend(ws, { type: `${type}-result`, success: false, error: err.message });
      }
    });
  });
};
