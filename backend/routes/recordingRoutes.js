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

const DEVICE_KIND = {
  VIRTUAL: 'virtual',
  BUILT_IN: 'built-in',
  EXTERNAL: 'external',
  MONITOR: 'monitor',
  UNKNOWN: 'unknown',
};

const VIRTUAL_DEVICE_PATTERNS = [
  /black\s?hole/i,
  /loopback/i,
  /soundflower/i,
  /vb[-\s]?cable/i,
  /voicemeeter/i,
  /virtual/i,
  /aggregate/i,
  /obs/i,
  /wiretap/i,
  /dante/i,
];

const BUILT_IN_DEVICE_PATTERNS = [
  /built[-\s]?in/i,
  /internal/i,
  /macbook/i,
  /imac/i,
  /apple/i,
  /studio display/i,
  /display audio/i,
];

const EXTERNAL_DEVICE_PATTERNS = [
  /usb/i,
  /bluetooth/i,
  /airpods/i,
  /headset/i,
  /microphone/i,
  /\bmic\b/i,
  /line in/i,
  /thunderbolt/i,
  /type[-\s]?c/i,
  /focusrite/i,
  /scarlett/i,
  /behringer/i,
  /yamaha/i,
  /steinberg/i,
  /motu/i,
  /apollo/i,
  /rode/i,
  /shure/i,
  /audio technica/i,
];

function uniqueDevicesByValue(devices) {
  const seen = new Set();
  return devices.filter((device) => {
    const key = String(device?.value || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildDeviceEntry({ label, value, isDefault = false, kind = DEVICE_KIND.UNKNOWN, source = '' }) {
  const nextLabel = String(label || value || '').trim();
  const nextValue = String(value || nextLabel).trim();

  return {
    label: nextLabel,
    value: nextValue,
    isDefault: Boolean(isDefault),
    kind,
    source,
  };
}

function inferDeviceKind(name, { routeType = 'input', isMonitor = false } = {}) {
  const normalized = String(name || '').toLowerCase();
  if (!normalized) {
    return DEVICE_KIND.UNKNOWN;
  }

  if (routeType === 'input' && isMonitor) {
    return DEVICE_KIND.MONITOR;
  }

  if (normalized.includes('.monitor') || /\bmonitor\b/i.test(normalized)) {
    return routeType === 'input' ? DEVICE_KIND.MONITOR : DEVICE_KIND.VIRTUAL;
  }

  if (VIRTUAL_DEVICE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return DEVICE_KIND.VIRTUAL;
  }

  if (BUILT_IN_DEVICE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return DEVICE_KIND.BUILT_IN;
  }

  if (EXTERNAL_DEVICE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return DEVICE_KIND.EXTERNAL;
  }

  return DEVICE_KIND.UNKNOWN;
}

function parseMacInputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/AVFoundation audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/AVFoundation video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection) {
      continue;
    }

    const match = line.match(/^\[(?:[^\]]*)\]\s*\[(\d+)\]\s*(.+)$/) || line.match(/^\[(\d+)\]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const index = match[1];
    const name = String(match[2] || '').trim();
    if (!name) {
      continue;
    }

    devices.push(buildDeviceEntry({
      label: name,
      value: `:${index}`,
      kind: inferDeviceKind(name, { routeType: 'input' }),
      source: 'avfoundation',
    }));
  }

  return uniqueDevicesByValue(devices);
}

function parseWindowsInputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/DirectShow audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/DirectShow video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection) {
      continue;
    }

    const quoted = line.match(/"([^"]+)"/);
    if (!quoted) {
      continue;
    }

    const name = String(quoted[1] || '').trim();
    if (!name || /alternative name/i.test(name)) {
      continue;
    }

    devices.push(buildDeviceEntry({
      label: name,
      value: name,
      kind: inferDeviceKind(name, { routeType: 'input' }),
      source: 'dshow',
    }));
  }

  return uniqueDevicesByValue(devices);
}

function parseLinuxInputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = [];

  for (const line of lines) {
    if (/^sources:/i.test(line) || /^source #/i.test(line) || /^mixer:/i.test(line)) {
      continue;
    }

    let name = '';
    let source = 'alsa';

    if (line.includes('\t')) {
      const columns = line.split(/\t+/).filter(Boolean);
      if (columns.length >= 2) {
        name = columns[1];
        source = 'pactl';
      } else if (columns.length === 1) {
        name = columns[0];
        source = 'pactl';
      }
    } else {
      const pactlMatch = line.match(/^\d+\s+([^\s]+.*)$/);
      const alsaMatch = line.match(/^card\s+\d+:\s*.+?\[(.+?)\].*$/i) || line.match(/^device\s+\d+:\s*.+?\[(.+?)\].*$/i);
      const wpctlMatch = line.match(/^\*?\s*\d+\.\s*(.+?)(?:\s+\[.*)?$/);

      if (pactlMatch) {
        name = pactlMatch[1].trim();
        source = 'pactl';
      } else if (alsaMatch) {
        name = alsaMatch[1].trim();
      } else if (wpctlMatch) {
        name = wpctlMatch[1].trim();
        source = 'wpctl';
      }
    }

    name = String(name || '').trim();
    if (!name) {
      continue;
    }

    const kind = name.includes('.monitor') || /monitor/i.test(name)
      ? DEVICE_KIND.MONITOR
      : inferDeviceKind(name, { routeType: 'input' });

    devices.push(buildDeviceEntry({
      label: name,
      value: name,
      kind,
      source,
    }));
  }

  return uniqueDevicesByValue(devices);
}

function parseInputDevices(raw, platform) {
  if (platform === 'darwin') {
    return parseMacInputDevices(raw);
  }

  if (platform === 'win32') {
    return parseWindowsInputDevices(raw);
  }

  return parseLinuxInputDevices(raw);
}

function parseWindowsOutputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = [];

  for (const line of lines) {
    if (/^name$/i.test(line) || /^device$/i.test(line)) {
      continue;
    }

    const name = String(line.replace(/^"|"$/g, '')).trim();
    if (!name) {
      continue;
    }

    devices.push(buildDeviceEntry({
      label: name,
      value: name,
      kind: inferDeviceKind(name, { routeType: 'output' }),
      source: 'powershell',
    }));
  }

  return uniqueDevicesByValue(devices);
}

function parseLinuxOutputDevices(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = [];

  for (const line of lines) {
    if (/^sinks:/i.test(line) || /^sink #/i.test(line) || /^available/i.test(line)) {
      continue;
    }

    let name = '';
    let source = 'pactl';

    if (line.includes('\t')) {
      const columns = line.split(/\t+/).filter(Boolean);
      if (columns.length >= 2) {
        name = columns[1];
      } else if (columns.length === 1) {
        name = columns[0];
      }
    } else {
      const wpctlMatch = line.match(/^\*?\s*\d+\.\s*(.+?)(?:\s+\[.*)?$/);
      if (wpctlMatch) {
        name = wpctlMatch[1].trim();
        source = 'wpctl';
      }
    }

    name = String(name || '').trim();
    if (!name) {
      continue;
    }

    devices.push(buildDeviceEntry({
      label: name,
      value: name,
      kind: inferDeviceKind(name, { routeType: 'output' }),
      source,
    }));
  }

  return uniqueDevicesByValue(devices);
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

// 启动 macOS 实时监听：麦克风输入直出到当前系统输出设备
router.post('/start-live-mic-playback', (req, res) => {
  try {
    const { device, outputDevice } = req.body || {};
    const result = recordingService.startLiveMicPlayback(device, outputDevice);

    if (!result.success) {
      return res.status(400).json({ success: false, message: '启动实时监听失败', error: result.error });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, message: '启动实时监听失败', error: error.message });
  }
});

// 停止 macOS 实时监听
router.post('/stop-live-mic-playback', (req, res) => {
  try {
    const result = recordingService.stopLiveMicPlayback();

    if (!result.success && result.error !== 'not-running') {
      return res.status(400).json({ success: false, message: '停止实时监听失败', error: result.error });
    }

    return res.json({ success: true, data: result.data || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: '停止实时监听失败', error: error.message });
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
      devices.push(buildDeviceEntry({
        label: i === 0 ? `${line}（默认）` : line,
        value: line,
        isDefault: i === 0,
        kind: inferDeviceKind(line, { routeType: 'output' }),
        source: 'switchaudiosource',
      }));
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
      devices.push(buildDeviceEntry({
        label: current.name,
        value: current.name,
        isDefault: !!current.isDefault,
        kind: inferDeviceKind(current.name, { routeType: 'output' }),
        source: 'system_profiler',
      }));
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

  return uniqueDevicesByValue(devices);
}

function parseOutputDevices(raw, platform) {
  if (platform === 'darwin') {
    return parseMacOutputDevices(raw);
  }

  if (platform === 'win32') {
    return parseWindowsOutputDevices(raw);
  }

  return parseLinuxOutputDevices(raw);
}

// 列出可用输入音频设备（基于 ffmpeg / platform probes）
router.get(['/list-input-devices', '/list-devices'], (req, res) => {
  try {
    const platform = process.platform;
    const raw = listInputDevicesRaw(platform);
    const devices = parseInputDevices(raw, platform);
    res.json({ success: true, platform, deviceType: 'input', devices, raw });
  } catch (error) {
    res.status(500).json({ success: false, message: '列出输入设备失败', error: error.message });
  }
});

// 列出可用输出音频设备（系统输出 / sink）
router.get('/list-output-devices', (req, res) => {
  try {
    const platform = process.platform;
    const raw = listOutputDevicesRaw(platform);
    const devices = parseOutputDevices(raw, platform);
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