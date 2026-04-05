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

function listInputDevicesRaw(platform) {
  let out = '';

  if (platform === 'darwin') {
    const p = spawnSync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '""'], { encoding: 'utf8' });
    out = (p.stderr || p.stdout || '').toString();
  } else if (platform === 'win32') {
    const p = spawnSync('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
    out = (p.stderr || p.stdout || '').toString();
  } else {
    const p = spawnSync('ffmpeg', ['-f', 'alsa', '-list_devices', 'true', '-i', 'dummy'], { encoding: 'utf8' });
    out = (p.stderr || p.stdout || '').toString();
    if (!out || /not found|error/i.test(out)) {
      const q = spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8' });
      out = (q.stdout || q.stderr || '').toString();
    }
  }

  return out;
}

function listOutputDevicesRaw(platform) {
  let out = '';

  if (platform === 'darwin') {
    const whichSwitch = spawnSync('which', ['SwitchAudioSource'], { encoding: 'utf8' });
    if (whichSwitch && whichSwitch.status === 0) {
      const p = spawnSync('SwitchAudioSource', ['-a', '-t', 'output'], { encoding: 'utf8' });
      out = (p.stdout || p.stderr || '').toString();
    }

    if (!out) {
      const p = spawnSync('system_profiler', ['SPAudioDataType'], { encoding: 'utf8' });
      out = (p.stdout || p.stderr || '').toString();
    }
  } else if (platform === 'win32') {
    const p = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_SoundDevice | Where-Object { $_.Status -eq 'OK' } | Select-Object -ExpandProperty Name"
    ], { encoding: 'utf8' });
    out = (p.stdout || p.stderr || '').toString();
  } else {
    const p = spawnSync('pactl', ['list', 'short', 'sinks'], { encoding: 'utf8' });
    out = (p.stdout || p.stderr || '').toString();
    if (!out || /not found|error/i.test(out)) {
      const q = spawnSync('wpctl', ['status'], { encoding: 'utf8' });
      out = (q.stdout || q.stderr || '').toString();
    }
  }

  return out;
}

function switchOutputDeviceRaw(platform, device) {
  const targetDevice = String(device || '').trim();
  if (!targetDevice) {
    return { success: false, message: '缺少 device' };
  }

  if (platform === 'darwin') {
    const whichSwitch = spawnSync('which', ['SwitchAudioSource'], { encoding: 'utf8' });
    if (!whichSwitch || whichSwitch.status !== 0) {
      return { success: false, message: '未找到 SwitchAudioSource，请先安装后再切换输出设备' };
    }

    const result = spawnSync('SwitchAudioSource', ['-s', targetDevice, '-t', 'output'], { encoding: 'utf8' });
    if (!result || result.status !== 0) {
      const errorText = String(result?.stderr || result?.stdout || '').trim();
      return {
        success: false,
        message: errorText || `切换输出设备失败: ${targetDevice}`,
      };
    }

    return {
      success: true,
      platform,
      device: targetDevice,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim(),
    };
  }

  if (platform === 'linux') {
    const pactlProbe = spawnSync('which', ['pactl'], { encoding: 'utf8' });
    if (pactlProbe && pactlProbe.status === 0) {
      const pactlResult = spawnSync('pactl', ['set-default-sink', targetDevice], { encoding: 'utf8' });
      if (!pactlResult || pactlResult.status !== 0) {
        const errorText = String(pactlResult?.stderr || pactlResult?.stdout || '').trim();
        return {
          success: false,
          message: errorText || `切换输出设备失败: ${targetDevice}`,
        };
      }

      return {
        success: true,
        platform,
        device: targetDevice,
        stdout: String(pactlResult.stdout || '').trim(),
        stderr: String(pactlResult.stderr || '').trim(),
      };
    }

    return { success: false, message: '当前系统未安装 pactl，无法切换输出设备' };
  }

  if (platform === 'win32') {
    return { success: false, message: '当前平台暂不支持通过后端切换输出设备' };
  }

  return { success: false, message: `当前平台 ${platform} 暂不支持切换输出设备` };
}

function parseMacOutputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every(line => !line.includes(':') && !line.includes('('))) {
    // SwitchAudioSource -a -t output format: each line is a device name
    const devices = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      devices.push({
        label: i === 0 ? `${line}（默认）` : line,
        value: line,
        isDefault: i === 0,
      });
    }
    return devices;
  }

  // system_profiler format
  const devices = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) {
      return;
    }

    if (current.isOutput) {
      devices.push({
        label: current.name,
        value: current.name,
        isDefault: !!current.isDefault,
      });
    }

    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (/^Audio:$/i.test(trimmed) || /^Devices:$/i.test(trimmed)) {
      continue;
    }

    if (/^\s{8}[^:]+:$/.test(line) || (!/^\s/.test(line) && /:$/.test(trimmed) && !/^[A-Za-z]+:$/i.test(trimmed))) {
      pushCurrent();
      current = {
        name: trimmed.replace(/:$/, ''),
        isOutput: false,
        isDefault: false,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (/Default Output Device:\s*Yes/i.test(trimmed) || /Default System Output Device:\s*Yes/i.test(trimmed) || /Output Channels:\s*\d+/i.test(trimmed) || /Output Source:/i.test(trimmed)) {
      current.isOutput = true;
    }

    if (/Default Output Device:\s*Yes/i.test(trimmed) || /Default System Output Device:\s*Yes/i.test(trimmed)) {
      current.isDefault = true;
      current.isOutput = true;
    }
  }

  pushCurrent();

  const seen = new Set();
  return devices.filter((device) => {
    const key = String(device.value || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 列出可用输入音频设备（基于 ffmpeg / platform probes）
router.get(['/list-input-devices', '/list-devices'], (req, res) => {
  try {
    const platform = process.platform;
    const raw = listInputDevicesRaw(platform);
    res.json({ success: true, platform, deviceType: 'input', raw });
  } catch (error) {
    res.status(500).json({ success: false, message: '列出输入设备失败', error: error.message });
  }
});

// 列出可用输出音频设备（系统输出 / sink）
router.get('/list-output-devices', (req, res) => {
  try {
    const platform = process.platform;
    const raw = listOutputDevicesRaw(platform);
    const devices = platform === 'darwin' ? parseMacOutputDevices(raw) : [];
    const includeRaw = String(req.query?.debug || '') === '1';
    res.json({
      success: true,
      platform,
      deviceType: 'output',
      devices,
      ...(includeRaw ? { raw } : {}),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '列出输出设备失败', error: error.message });
  }
});

// 切换系统输出设备（macOS 通过 SwitchAudioSource，Linux 通过 pactl）
router.post('/switch-output-device', (req, res) => {
  try {
    const { device } = req.body || {};
    const platform = process.platform;
    const result = switchOutputDeviceRaw(platform, device);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || '切换输出设备失败',
      });
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: '切换输出设备失败', error: error.message });
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