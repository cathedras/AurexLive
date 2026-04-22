import { apiDelete, apiGet, apiPost } from '../apiClientUtil'
import wsClient from '../wsClientService.js'

const BASE_URL = `${String(import.meta.env.VITE_API_BASE_URL || '/v1').replace(/\/$/, '')}/recording`

export const getRecordingStatus = async (fileName) => {
  try {
    const params = fileName ? { fileName } : {}
    return await apiGet(`${BASE_URL}/recording-status`, { params })
  } catch (error) {
    console.error('获取录音状态失败:', error)
    throw error
  }
}

export const getRecordingList = async () => {
  try {
    return await apiGet(`${BASE_URL}/list-recordings`)
  } catch (error) {
    console.error('获取录音列表失败:', error)
    throw error
  }
}

export const listInputDevices = async () => {
  try {
    return await apiGet(`${BASE_URL}/list-input-devices`)
  } catch (error) {
    console.error('列出输入设备失败:', error)
    throw error
  }
}

export const listOutputDevices = async () => {
  try {
    return await apiGet(`${BASE_URL}/list-output-devices`)
  } catch (error) {
    console.error('列出输出设备失败:', error)
    throw error
  }
}

export const switchOutputDevice = async (device) => {
  try {
    return await apiPost(`${BASE_URL}/switch-output-device`, { device })
  } catch (error) {
    console.error('切换输出设备失败:', error)
    throw error
  }
}

export const listRecordingDevices = listInputDevices

export const deleteRecording = async (filename) => {
  try {
    return await apiDelete(`${BASE_URL}/${encodeURIComponent(filename)}`)
  } catch (error) {
    console.error('删除录音失败:', error)
    throw error
  }
}

export const startRecordingBackend = async ({ clientId, device, outFileName } = {}) => {
  try {
    return await apiPost(`${BASE_URL}/start-recording-backend`, { clientId, device, outFileName })
  } catch (error) {
    console.error('后端开始录音失败:', error)
    throw error
  }
}

export const stopRecordingBackend = async (fileName) => {
  try {
    return await apiPost(`${BASE_URL}/stop-recording-backend`, { fileName })
  } catch (error) {
    console.error('后端停止录音失败:', error)
    throw error
  }
}

export const startLiveMicPlayback = async (device, outputDevice) => {
  try {
    return await apiPost(`${BASE_URL}/start-live-mic-playback`, { device, outputDevice })
  } catch (error) {
    console.error('启动实时监听失败:', error)
    throw error
  }
}

export const stopLiveMicPlayback = async () => {
  try {
    return await apiPost(`${BASE_URL}/stop-live-mic-playback`, {})
  } catch (error) {
    console.error('停止实时监听失败:', error)
    throw error
  }
}

export const recordingUse = async (filename, newName) => {
  try {
    return await apiPost(`${BASE_URL}/use-recording`, { filename, newName })
  } catch (error) {
    console.error('使用录音失败:', error)
    throw error
  }
}

// ------------------------------
// WebSocket helpers for recording (uses shared wsClient)
// ------------------------------
let _recordingFacade = null;
let _wsVolumeHandler = null;
let _wsGenericHandler = null;

export const connectRecordingSocket = (onVolume, onOpen, onClose, onGenericMessage) => {
  _wsVolumeHandler = onVolume;
  _wsGenericHandler = onGenericMessage;

  return wsClient.connect({ usage: 'recording' },
    (volume) => { _wsVolumeHandler && _wsVolumeHandler(volume); },
    (ev) => { try { onOpen && onOpen(ev); } catch (e) {} },
    (ev) => { _recordingFacade = null; try { onClose && onClose(ev); } catch (e) {} },
    (msg) => { _wsGenericHandler && _wsGenericHandler(msg); }
  ).then((facade) => { _recordingFacade = facade; return facade; });
};

const wsSendCommand = (type, data, timeout = 15000) => {
  return new Promise((resolve, reject) => {
    if (!_recordingFacade || _recordingFacade.readyState() !== WebSocket.OPEN) return reject(new Error('ws_not_connected'));

    const handler = (msg) => {
      try {
        if (msg.type === `${type}-result`) {
          _wsGenericHandler && _wsGenericHandler(msg);
          resolve(msg);
          _wsGenericHandler = null;
        }
      } catch (e) {
        // ignore
      }
    };

    const prev = _wsGenericHandler;
    _wsGenericHandler = (m) => { handler(m); _wsGenericHandler = prev; };

    try {
      _recordingFacade.send(JSON.stringify({ type, data }));
    } catch (e) {
      _wsGenericHandler = prev;
      return reject(e);
    }

    const to = setTimeout(() => { _wsGenericHandler = prev; reject(new Error('ws_timeout')); }, timeout);
    const origResolve = resolve;
    resolve = (v) => { clearTimeout(to); origResolve(v); };
  });
};

export const wsStartRecordingBackend = async ({ device, outFileName, ffmpegArgs } = {}) => {
  return await wsSendCommand('start-backend', { device, outFileName, ffmpegArgs });
};

export const wsStopRecording = async (fileName) => {
  return await wsSendCommand('stop-recording', { fileName });
};

export const wsStartRecording = async () => {
  return await wsSendCommand('start-recording', {});
};

export const wsAddChunk = async (fileName, chunkBlob) => {
  const arrayBuffer = await chunkBlob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return await wsSendCommand('add-chunk', { fileName, chunkBase64: base64 });
};

export const closeRecordingSocket = () => {
  try { if (_recordingFacade) _recordingFacade.close(); } catch (e) {}
  _recordingFacade = null;
};
