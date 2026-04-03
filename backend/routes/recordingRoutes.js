const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const recordingService = require('../services/recordingService');
const ffmpegQueue = require('../services/ffmpegQueueService');
const { recordingDir } = require('../config/paths');
const { uploadDir } = require('../config/paths');
const { normalizeUploadFileName } = require('../utils/fileUtils');

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
      // simple platform-aware convenience: if device provided, use FLAC output with platform capture
      // caller may provide full ffmpegArgs for precise control
      if (process.platform === 'darwin') {
        args = ['-f', 'avfoundation', '-i', device, '-vn', '-c:a', 'flac', '-compression_level', '12', '-y'];
      } else if (process.platform === 'win32') {
        args = ['-f', 'dshow', '-i', device, '-vn', '-c:a', 'flac', '-compression_level', '12', '-y'];
      } else {
        args = ['-f', 'alsa', '-i', device, '-vn', '-c:a', 'flac', '-compression_level', '12', '-y'];
      }
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
router.post('/stop-recording-backend', async (req, res) => {
  try {
    const { fileName } = req.body || {};
    if (!fileName) return res.status(400).json({ success: false, message: '缺少 fileName' });
    const info = await recordingService.stopRecording(fileName);
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: '停止录音失败', error: error.message });
  }
});

// 查询录音状态
router.get('/recording-status', (req, res) => {
  try {
    const fileName = String(req.query?.fileName || '').trim();
    const data = recordingService.getStatus(fileName || undefined);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: '查询录音状态失败', error: error.message });
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
router.delete('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 验证文件名安全性
    if (path.resolve(recordingDir, filename).indexOf(recordingDir) !== 0) {
      return res.status(400).json({
        success: false,
        message: '无效的文件路径',
      });
    }
    
    await recordingService.deleteRecording(filename);
    
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

// 将录音复制到 uploads，并使用指定的显示名（前端用于“使用录音”功能）
router.post('/use-recording', async (req, res) => {
  try {
    const { filename, newName } = req.body || {};
    if (!filename) return res.status(400).json({ success: false, message: '缺少 filename' });

    const srcPath = path.join(recordingDir, filename);
    if (path.resolve(srcPath).indexOf(recordingDir) !== 0) {
      return res.status(400).json({ success: false, message: '无效的文件路径' });
    }

    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ success: false, message: '源录音不存在' });
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const displayName = (typeof newName === 'string' && newName.trim().length) ? newName.trim() : filename;
    const normalized = normalizeUploadFileName(displayName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const destName = `${uniqueSuffix}-${normalized}`;
    const destPath = path.join(uploadDir, destName);

    // copy file
    fs.copyFileSync(srcPath, destPath);

    const stats = fs.statSync(destPath);

    res.json({
      success: true,
      fileInfo: {
        name: normalized,
        size: stats.size,
        path: destPath,
        savedName: destName,
        url: `/v1/uploads/${encodeURIComponent(destName)}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '复制录音失败', error: error.message });
  }
});

module.exports = router;