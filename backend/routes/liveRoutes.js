const express = require('express');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const musicPlaybackService = require('../services/musicPlaybackService');

const {
  mobileCameraHtmlPath,
  mobileControlHtmlPath
} = require('../config/paths');
const {
  readLiveState,
  writeLiveState
} = require('../utils/liveStateStore');

const router = express.Router();
const cameraStreamClients = new Set();
let latestCameraFrame = null;

function parseImageDataUrl(imageData) {
  const matched = String(imageData || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matched) {
    return null;
  }

  const mimeType = matched[1];
  const base64 = matched[2];
  const buffer = Buffer.from(base64, 'base64');
  return {
    mimeType,
    buffer
  };
}

function writeMjpegFrame(res, frame) {
  if (!frame?.buffer?.length) {
    return;
  }

  res.write(`--frame\r\n`);
  res.write(`Content-Type: ${frame.mimeType}\r\n`);
  res.write(`Content-Length: ${frame.buffer.length}\r\n\r\n`);
  res.write(frame.buffer);
  res.write('\r\n');
}

function broadcastCameraFrame(frame) {
  cameraStreamClients.forEach((res) => {
    try {
      writeMjpegFrame(res, frame);
    } catch {
      cameraStreamClients.delete(res);
      try {
        res.end();
      } catch {
        // ignore stream close error
      }
    }
  });
}

function getLocalIpAddress() {
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

async function buildQrDataUrl(text) {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 220
  });
}

router.get('/live/state', (req, res) => {
  try {
    const state = readLiveState();
    return res.json({
      success: true,
      state: {
        playbackCommandId: state.playbackCommandId,
        playbackAction: state.playbackAction,
        effectCommandId: state.effectCommandId,
        effectName: state.effectName,
        cameraUpdatedAt: state.cameraUpdatedAt,
        updatedAt: state.updatedAt,
        backendPlayback: musicPlaybackService.getPublicState()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `读取实时状态失败：${error.message}` });
  }
});

router.post('/live/playback', (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    if (!['play', 'pause'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效操作，仅支持 play/pause' });
    }

    const prev = readLiveState();
    const next = writeLiveState({
      ...prev,
      playbackAction: action,
      playbackCommandId: Number(prev.playbackCommandId || 0) + 1
    });

    try {
      if (action === 'play') {
        musicPlaybackService.resume();
      }
      if (action === 'pause') {
        musicPlaybackService.pause();
      }
    } catch {
      // keep live control compatibility even when backend player is idle
    }

    return res.json({
      success: true,
      state: {
        ...next,
        backendPlayback: musicPlaybackService.getPublicState()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `更新播放控制失败：${error.message}` });
  }
});

router.post('/live/effect', (req, res) => {
  try {
    const effectName = String(req.body?.effectName || '').trim();
    if (!effectName) {
      return res.status(400).json({ success: false, message: '音效名称不能为空' });
    }

    const prev = readLiveState();
    const next = writeLiveState({
      ...prev,
      effectName,
      effectCommandId: Number(prev.effectCommandId || 0) + 1
    });

    return res.json({ success: true, state: next });
  } catch (error) {
    return res.status(500).json({ success: false, message: `更新音效控制失败：${error.message}` });
  }
});

router.post('/live/camera-frame', (req, res) => {
  try {
    const imageData = String(req.body?.imageData || '').trim();
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({ success: false, message: '无效图像数据' });
    }

    const parsedFrame = parseImageDataUrl(imageData);
    if (!parsedFrame) {
      return res.status(400).json({ success: false, message: '图像格式不合法' });
    }

    latestCameraFrame = parsedFrame;
    broadcastCameraFrame(parsedFrame);

    const prev = readLiveState();
    const next = writeLiveState({
      ...prev,
      cameraImageData: imageData,
      cameraUpdatedAt: new Date().toISOString()
    });

    return res.json({ success: true, updatedAt: next.cameraUpdatedAt });
  } catch (error) {
    return res.status(500).json({ success: false, message: `上传摄像头画面失败：${error.message}` });
  }
});

router.get('/live/camera-stream', (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Connection: 'keep-alive'
    });

    cameraStreamClients.add(res);

    if (!latestCameraFrame) {
      const state = readLiveState();
      const parsed = parseImageDataUrl(state.cameraImageData || '');
      if (parsed) {
        latestCameraFrame = parsed;
      }
    }

    if (latestCameraFrame) {
      writeMjpegFrame(res, latestCameraFrame);
    }

    const heartbeat = setInterval(() => {
      try {
        res.write('\r\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      cameraStreamClients.delete(res);
      try {
        res.end();
      } catch {
        // ignore
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `摄像头流启动失败：${error.message}` });
  }
});

router.get('/live/camera-frame', (req, res) => {
  try {
    const state = readLiveState();
    return res.json({
      success: true,
      hasFrame: Boolean(state.cameraImageData),
      imageData: state.cameraImageData || '',
      updatedAt: state.cameraUpdatedAt
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `读取摄像头画面失败：${error.message}` });
  }
});

router.get('/mobile/camera', (req, res) => {
  return res.sendFile(mobileCameraHtmlPath);
});

router.get('/mobile/control', (req, res) => {
  return res.sendFile(mobileControlHtmlPath);
});

router.get('/mobile/links', async (req, res) => {
  try {
    const localIp = getLocalIpAddress();
    const baseUrl = `http://${localIp}:3000`;
    const cameraUrl = `${baseUrl}/v1/mobile/camera`;
    const controlUrl = `${baseUrl}/v1/mobile/control`;

    const [cameraQr, controlQr] = await Promise.all([
      buildQrDataUrl(cameraUrl),
      buildQrDataUrl(controlUrl)
    ]);

    return res.json({
      success: true,
      baseUrl,
      links: {
        camera: cameraUrl,
        control: controlUrl
      },
      qrs: {
        camera: cameraQr,
        control: controlQr
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `生成二维码失败：${error.message}` });
  }
});

module.exports = router;
