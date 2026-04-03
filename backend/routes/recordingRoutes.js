const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const recordingService = require('../services/recordingService');
const ffmpegQueue = require('../services/ffmpegQueueService');
const { recordingDir } = require('../config/paths');

// 确保录音文件目录存在
if (!fs.existsSync(recordingDir)) {
  fs.mkdirSync(recordingDir, { recursive: true });
}

// 后端启动 ffmpeg 录音并可选将 PCM/音量数据通过 SSE/事件广播
router.post('/start-recording-backend', (req, res) => {
  try {
    const { clientId, device, outFileName, ffmpegArgs } = req.body || {};

    // Build ffmpegArgs if provided as array in body, otherwise require device
    let args = undefined;
    if (Array.isArray(ffmpegArgs) && ffmpegArgs.length) {
      args = ffmpegArgs;
    } else if (device) {
      // simple platform-aware convenience: if device provided, use avfoundation on mac or dshow on windows
      // caller may provide full ffmpegArgs for precise control
      args = ['-f', 'avfoundation', '-i', device, '-vn', '-c:a', 'aac', '-b:a', '128k', '-y'];
      if (outFileName) args.push(path.join(recordingDir, outFileName));
    }
    // let the recording service decide default device/args when args is undefined
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

// 待开发：前端当前未调用；用于转码任务入列
router.post('/convert', (req, res) => {
  try {
    const { fileName, inputUrl, outFileName, ffmpegArgs } = req.body || {};

    if (!fileName && !inputUrl && !(Array.isArray(ffmpegArgs) && ffmpegArgs.length)) {
      return res.status(400).json({ success: false, message: '缺少 fileName/inputUrl/ffmpegArgs' });
    }

    const jobData = {};
    if (fileName) jobData.input = path.join(recordingDir, fileName);
    if (inputUrl) jobData.input = inputUrl;
    if (outFileName) jobData.outFileName = outFileName;
    if (Array.isArray(ffmpegArgs) && ffmpegArgs.length) jobData.ffmpegArgs = ffmpegArgs;

    const jobId = ffmpegQueue.enqueue(jobData);
    res.json({ success: true, jobId });
  } catch (error) {
    res.status(500).json({ success: false, message: '入列失败', error: error.message });
  }
});

// 待开发：前端当前未调用；用于查询转码队列任务状态
router.get('/jobs/:id', (req, res) => {
  try {
    const job = ffmpegQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'job not found' });
    res.json({ success: true, job });
  } catch (error) {
    res.status(500).json({ success: false, message: '查询失败', error: error.message });
  }
});

// 待开发：前端当前未调用；用于取消转码队列任务
router.post('/jobs/:id/cancel', (req, res) => {
  try {
    const ok = ffmpegQueue.cancelJob(req.params.id);
    if (!ok) return res.status(400).json({ success: false, message: '无法取消或任务已结束' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '取消失败', error: error.message });
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