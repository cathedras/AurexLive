const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const recordingService = require('../services/recordingService');
const { recordingDir } = require('../config/paths');

// 确保录音文件目录存在
if (!fs.existsSync(recordingDir)) {
  fs.mkdirSync(recordingDir, { recursive: true });
}

// 获取录音状态
router.get('/recording-status', (req, res) => {
  try {
    const { fileName } = req.query;
    const status = recordingService.getStatus(fileName);
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取录音状态失败',
      error: error.message,
    });
  }
});

// 开始录音
router.post('/start-recording', (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: '缺少客户端ID',
      });
    }

    const recordingInfo = recordingService.startRecording(clientId);

    res.json({
      success: true,
      message: '录音已开始',
      data: recordingInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '开始录音失败',
      error: error.message,
    });
  }
});

// 后端启动 ffmpeg 录音并可选将 PCM/音量数据通过 SSE/事件广播
router.post('/start-recording-backend', (req, res) => {
  try {
    const { clientId, device, outFileName, ffmpegArgs } = req.body || {};

    // Build ffmpegArgs if provided as array in body, otherwise allow default inside service
    let args = undefined;
    if (Array.isArray(ffmpegArgs) && ffmpegArgs.length) args = ffmpegArgs;
    else if (device) {
      // simple platform-aware convenience: if device provided, use avfoundation on mac or dshow on windows
      // caller may provide full ffmpegArgs for precise control
      args = ['-f', 'avfoundation', '-i', device, '-vn', '-c:a', 'aac', '-b:a', '128k', '-y'];
      if (outFileName) args.push(path.join(recordingDir, outFileName));
    }

    const info = recordingService.startRecordingWithFfmpeg(clientId || null, args, outFileName);
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: '后端启动录音失败', error: error.message });
  }
});

// 停止后端录音（ffmpeg 或 legacy chunk 模式）
router.post('/stop-recording-backend', (req, res) => {
  try {
    const { fileName } = req.body || {};
    if (!fileName) return res.status(400).json({ success: false, message: '缺少 fileName' });
    const info = recordingService.stopRecording(fileName);
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: '停止录音失败', error: error.message });
  }
});

// SSE endpoint: subscribe to volume/pcm events for a given recording fileName
router.get('/recording-sse/:filename', (req, res) => {
  const { filename } = req.params;

  // set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // heartbeat
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  const listener = (volumeData) => {
    try {
      if (!volumeData || volumeData.fileName !== filename) return;
      // send as JSON event
      const payload = JSON.stringify(volumeData);
      res.write(`event: volume\ndata: ${payload}\n\n`);
    } catch (e) {
      // ignore
    }
  };

  recordingService.onVolume(listener);

  req.on('close', () => {
    clearInterval(keepAlive);
    recordingService.offVolume(listener);
    try { res.end(); } catch (e) {}
  });
});

// 新增：通过 ffmpeg 实时计算并推送音量（astats）——支持文件或设备输入
router.get('/ffmpeg-volume-sse', (req, res) => {
  const { fileName, device } = req.query;

  // 必须指定 fileName 或 device
  if (!fileName && !device) {
    return res.status(400).json({ success: false, message: '缺少 fileName 或 device 参数' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  // 构建 ffmpeg 参数
  const ffArgs = [];
  if (fileName) {
    const p = path.join(recordingDir, fileName);
    ffArgs.push('-i', p);
  } else if (device) {
    const platform = process.platform;
    if (platform === 'darwin') {
      ffArgs.push('-f', 'avfoundation', '-i', device);
    } else if (platform === 'win32') {
      ffArgs.push('-f', 'dshow', '-i', device);
    } else {
      ffArgs.push('-f', 'alsa', '-i', device);
    }
  }

  // 使用 astats 输出 metadata，reset=1 为每帧/块输出
  ffArgs.push('-vn', '-af', 'astats=metadata=1:reset=1', '-f', 'null', '-');

  const ff = spawn('ffmpeg', ffArgs);

  let buf = '';
  ff.stderr.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      // 提取 key=value 对（数字）
      const obj = { source: fileName || device };
      const re = /([A-Za-z0-9_.]+)=\s*(-?\d+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        obj[m[1]] = parseFloat(m[2]);
      }
      if (Object.keys(obj).length > 1) {
        try {
          res.write(`event: volume\n`);
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch (e) {
          // ignore write errors
        }
      }
    }
  });

  ff.on('exit', (code, sig) => {
    clearInterval(keepAlive);
    try {
      res.write(`event: end\n`);
      res.write(`data: ${JSON.stringify({ code, sig })}\n\n`);
    } catch (e) {}
    try { res.end(); } catch (e) {}
  });

  ff.on('error', (err) => {
    clearInterval(keepAlive);
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`);
    } catch (e) {}
    try { res.end(); } catch (e) {}
  });

  req.on('close', () => {
    clearInterval(keepAlive);
    try { ff.kill('SIGTERM'); } catch (e) {}
    try { res.end(); } catch (e) {}
  });
});

// 接收录音数据块
router.post('/recording-chunk/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const chunk = req.body.chunk; // 音频数据块

    if (!chunk) {
      return res.status(400).json({
        success: false,
        message: '缺少音频数据块',
      });
    }

    // 将Base64数据转换为Buffer
    const buffer = Buffer.from(chunk, 'base64');
    
    recordingService.addRecordingChunk(filename, buffer);

    res.json({
      success: true,
      message: '音频数据块已接收',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '处理音频数据块失败',
      error: error.message,
    });
  }
});

// 获取录音列表
router.get('/list-recordings', (req, res) => {
  try {
    const recordings = recordingService.getList();
    
    res.json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取录音列表失败',
      error: error.message,
    });
  }
});

// 列出可用音频设备（基于 ffmpeg / platform probes）
router.get('/list-devices', (req, res) => {
  try {
    const platform = process.platform;
    const { spawnSync } = require('child_process');
    let out = '';

    if (platform === 'darwin') {
      // avfoundation lists devices on stderr
      const p = spawnSync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '""'], { encoding: 'utf8' });
      out = (p.stderr || p.stdout || '').toString();
    } else if (platform === 'win32') {
      // dshow lists devices on stderr as well
      const p = spawnSync('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
      out = (p.stderr || p.stdout || '').toString();
    } else {
      // On linux try using ffmpeg to list pulse devices, otherwise try pactl
      const p = spawnSync('ffmpeg', ['-f', 'alsa', '-list_devices', 'true', '-i', 'dummy'], { encoding: 'utf8' });
      out = (p.stderr || p.stdout || '').toString();
      if (!out || /not found|error/i.test(out)) {
        const q = spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8' });
        out = (q.stdout || q.stderr || '').toString();
      }
    }

    res.json({ success: true, platform, raw: out });
  } catch (error) {
    res.status(500).json({ success: false, message: '列出设备失败', error: error.message });
  }
});

// 删除录音文件
router.delete('/recording/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 验证文件名安全性
    if (path.resolve(recordingDir, filename).indexOf(recordingDir) !== 0) {
      return res.status(400).json({
        success: false,
        message: '无效的文件路径',
      });
    }
    
    recordingService.deleteRecording(filename);
    
    res.json({
      success: true,
      message: '录音文件已删除',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '删除录音文件失败',
      error: error.message,
    });
  }
});

module.exports = router;