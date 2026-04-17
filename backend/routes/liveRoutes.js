const express = require('express');
const os = require('os');
const QRCode = require('qrcode');
const musicPlaybackService = require('../services/musicPlaybackService');
const { mobileControlHtmlPath } = require('../config/paths');
const {
  readLiveState,
  writeLiveState
} = require('../utils/liveStateStore');

const router = express.Router();

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

router.get('/state', (req, res) => {
  try {
    const state = readLiveState();
    return res.json({
      success: true,
      state: {
        playbackCommandId: state.playbackCommandId,
        playbackAction: state.playbackAction,
        effectCommandId: state.effectCommandId,
        effectName: state.effectName,
        updatedAt: state.updatedAt,
        backendPlayback: musicPlaybackService.getPublicState()
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: `读取实时状态失败：${error.message}` });
  }
});

router.post('/playback', (req, res) => {
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

router.post('/effect', (req, res) => {
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

module.exports = router;
