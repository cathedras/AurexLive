const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/v1';

/**
 * 获取录音状态
 */
export const getRecordingStatus = async (fileName) => {
  try {
    const params = fileName ? `?fileName=${encodeURIComponent(fileName)}` : '';
    const response = await fetch(`${BASE_URL}/recording-status${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('获取录音状态失败:', error);
    throw error;
  }
};

/**
 * 开始录音
 */
export const startRecording = async (clientId) => {
  try {
    const response = await fetch(`${BASE_URL}/start-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clientId }),
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('开始录音失败:', error);
    throw error;
  }
};

/**
 * 发送录音数据块
 */
export const sendRecordingChunk = async (chunk, filename) => {
  try {
    // 将Blob转换为ArrayBuffer，然后转为Base64
    const arrayBuffer = await chunk.arrayBuffer();
    const base64Chunk = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    const response = await fetch(`${BASE_URL}/recording-chunk/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chunk: base64Chunk }),
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('发送录音数据块失败:', error);
    throw error;
  }
};

/**
 * 获取录音列表
 */
export const getRecordingList = async () => {
  try {
    const response = await fetch(`${BASE_URL}/list-recordings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('获取录音列表失败:', error);
    throw error;
  }
};

/**
 * 列举可用设备（后端 probe）
 */
export const listRecordingDevices = async () => {
  try {
    const response = await fetch(`${BASE_URL}/list-devices`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return await response.json();
  } catch (error) {
    console.error('列出设备失败:', error);
    throw error;
  }
};

/**
 * 删除录音文件
 */
export const deleteRecording = async (filename) => {
  try {
    const response = await fetch(`${BASE_URL}/recording/${filename}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('删除录音失败:', error);
    throw error;
  }
};

/**
 * 后端启动录音（由服务器上的 ffmpeg 执行）
 */
export const startRecordingBackend = async ({ clientId, device, outFileName, ffmpegArgs } = {}) => {
  try {
    const body = { clientId, device, outFileName, ffmpegArgs };
    const response = await fetch(`${BASE_URL}/start-recording-backend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch (error) {
    console.error('后端开始录音失败:', error);
    throw error;
  }
};

export const stopRecordingBackend = async (fileName) => {
  try {
    const response = await fetch(`${BASE_URL}/stop-recording-backend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    });
    return await response.json();
  } catch (error) {
    console.error('后端停止录音失败:', error);
    throw error;
  }
};

/**
 * 使用 SSE 订阅后端推送的音量/PCM 事件
 * onVolume: function(eventData)
 * 返回一个对象 { es, close() }
 */
export const subscribeRecordingSSE = (fileName, onVolume, onOpen, onError) => {
  const url = `${BASE_URL}/recording-sse/${encodeURIComponent(fileName)}`;
  const es = new EventSource(url);

  es.addEventListener('volume', (e) => {
    try {
      const data = JSON.parse(e.data);
      onVolume && onVolume(data);
    } catch (err) {
      console.error('解析 volume 事件失败', err);
    }
  });

  es.onopen = (ev) => onOpen && onOpen(ev);
  es.onerror = (ev) => onError && onError(ev);

  return {
    es,
    close: () => {
      try { es.close(); } catch (e) {}
    }
  };
};

// ------------------------------
// WebSocket helpers for recording
// ------------------------------
let _recordingWs = null;
let _wsVolumeHandler = null;
let _wsGenericHandler = null;

export const connectRecordingSocket = (onVolume, onOpen, onClose, onGenericMessage) => {
  if (_recordingWs && _recordingWs.readyState === WebSocket.OPEN) {
    _wsVolumeHandler = onVolume;
    _wsGenericHandler = onGenericMessage;
    return Promise.resolve({
      close: () => { try { if (_recordingWs) _recordingWs.close(); } catch (e) {} },
      send: (data) => { try { if (_recordingWs) _recordingWs.send(data); } catch (e) {} },
      readyState: () => (_recordingWs ? _recordingWs.readyState : WebSocket.CLOSED)
    });
  }

  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const apiPort = import.meta.env.VITE_API_PORT || '3000';
  const host = location.hostname || 'localhost';

  // Build attempt list: primary backend port, then location.host (may include dev proxy port), then bare hostname
  const attemptUrls = [
    `${scheme}://${host}:${apiPort}`,
    `${scheme}://${location.host}`,
    `${scheme}://${location.hostname}`
  ];

  _wsVolumeHandler = onVolume;
  _wsGenericHandler = onGenericMessage;











  // start first attempt

  // return a promise that resolves when a connection is established or rejects after attempts
  return new Promise((resolve, reject) => {
    let finished = false;

    const wrapOnOpen = (ev) => {
      finished = true;
      try { onOpen && onOpen(ev); } catch (e) {}
      const facade = {
        close: () => { try { if (_recordingWs) _recordingWs.close(); } catch (e) {} },
        send: (data) => { try { if (_recordingWs) _recordingWs.send(data); } catch (e) {} },
        readyState: () => (_recordingWs ? _recordingWs.readyState : WebSocket.CLOSED)
      };
      resolve(facade);
    };

    const wrapOnClose = (ev) => {
      try { onClose && onClose(ev); } catch (e) {}
      if (!finished) {
        finished = true;
        reject(new Error('ws_connect_failed'));
      }
    };

    _wsVolumeHandler = onVolume;
    _wsGenericHandler = onGenericMessage;

    // attempt connections sequentially with timeout
    let ai = 0;
    const tryNextUrl = () => {
      if (ai >= attemptUrls.length) {
        wrapOnClose(new Event('error'));
        return;
      }
      const url = attemptUrls[ai++];
      try {
        const ws = new WebSocket(url);
        let localTimeout = null;

        ws.onopen = (ev) => {
          if (localTimeout) { clearTimeout(localTimeout); localTimeout = null; }
          _recordingWs = ws;
          ws.onmessage = (evm) => {
            try {
              const msg = JSON.parse(evm.data);
              if (!msg || !msg.type) return;
              if (msg.type === 'volume') {
                onVolume && onVolume(msg.data);
              } else {
                _wsGenericHandler && _wsGenericHandler(msg);
              }
            } catch (e) {
              console.error('Invalid WS message', e);
            }
          };
          ws.onclose = (evm) => { _recordingWs = null; try { onClose && onClose(evm); } catch (e) {} };
          ws.onerror = (evm) => { console.error('Recording WS error', evm); };
          wrapOnOpen(ev);
        };

        ws.onerror = () => {
          if (localTimeout) { clearTimeout(localTimeout); localTimeout = null; }
          try { ws.close(); } catch (e) {}
          // try next url
          tryNextUrl();
        };

        localTimeout = setTimeout(() => {
          try { ws.close(); } catch (e) {}
          tryNextUrl();
        }, 3000);
      } catch (e) {
        tryNextUrl();
      }
    };

    tryNextUrl();
  });
};

// send a command and wait for a `${type}-result` response (simple correlation)
const wsSendCommand = (type, data, timeout = 15000) => {
  return new Promise((resolve, reject) => {
    if (!_recordingWs || _recordingWs.readyState !== WebSocket.OPEN) {
      return reject(new Error('ws_not_connected'));
    }

    const handler = (msg) => {
      try {
        if (msg.type === `${type}-result`) {
          _wsGenericHandler && _wsGenericHandler(msg);
          resolve(msg);
          // remove temporary listener
          _wsGenericHandler = null;
        }
      } catch (e) {
        // ignore
      }
    };

    // inject a temporary generic handler to catch the result
    const prev = _wsGenericHandler;
    _wsGenericHandler = (m) => {
      handler(m);
      // restore previous
      _wsGenericHandler = prev;
    };

    try {
      _recordingWs.send(JSON.stringify({ type, data }));
    } catch (e) {
      _wsGenericHandler = prev;
      return reject(e);
    }

    const to = setTimeout(() => {
      _wsGenericHandler = prev;
      reject(new Error('ws_timeout'));
    }, timeout);
    // wrap resolve to clear timeout
    const origResolve = resolve;
    resolve = (v) => { clearTimeout(to); origResolve(v); };
  });
};

export const wsStartRecordingBackend = async ({ device, outFileName, ffmpegArgs } = {}) => {
  const resp = await wsSendCommand('start-backend', { device, outFileName, ffmpegArgs });
  return resp;
};

export const wsStopRecording = async (fileName) => {
  const resp = await wsSendCommand('stop-recording', { fileName });
  return resp;
};

export const wsStartRecording = async () => {
  const resp = await wsSendCommand('start-recording', {});
  return resp;
};

export const wsAddChunk = async (fileName, chunkBlob) => {
  // convert blob to base64
  const arrayBuffer = await chunkBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  const resp = await wsSendCommand('add-chunk', { fileName, chunkBase64: base64 });
  return resp;
};

export const closeRecordingSocket = () => {
  try { if (_recordingWs) _recordingWs.close(); } catch (e) {}
};