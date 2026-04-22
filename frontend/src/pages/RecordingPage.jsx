import { Copy, Headphones, Pause, Play, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'

import { useFloatingAudioPlayer } from '../component/FloatingAudioPlayerContext'
import { useLanguage } from '../context/languageContext'
import Modal from '../component/Modal'
import { deleteRecording, getRecordingList, startLiveMicPlayback, startRecordingBackend, stopLiveMicPlayback, stopRecordingBackend, switchOutputDevice, recordingUse } from '../services/musicPlay'
import wsClientService from '../services/wsClientService'

const getDeviceKindLabel = (kind, t) => {
  switch (kind) {
    case 'virtual':
      return t('Virtual', '虚拟')
    case 'built-in':
      return t('Built-in', '内置')
    case 'external':
      return t('External', '外接')
    case 'monitor':
      return t('Playback', '回放')
    default:
      return ''
  }
}

const formatDeviceLabel = (device, t) => {
  const baseLabel = String(device?.label || device?.value || '').trim()
  const tags = []

  if (device?.isDefault) {
    tags.push(t('Default', '默认'))
  }

  const kindLabel = getDeviceKindLabel(device?.kind, t)
  if (kindLabel) {
    tags.push(kindLabel)
  }

  if (tags.length === 0) {
    return baseLabel
  }

  return `${baseLabel}（${tags.join('·')}）`
}

const normalizeDeviceList = (items, t) => {
  if (!Array.isArray(items)) {
    return []
  }

  return items.map((item) => ({
    ...item,
    label: formatDeviceLabel(item, t),
    kind: item?.kind || 'unknown',
    isDefault: Boolean(item?.isDefault),
  }))
}

const pickDefaultDeviceValue = (items, fallbackMatchers = []) => {
  const defaultItem = items.find((item) => item?.isDefault)
  if (defaultItem) {
    return defaultItem.value
  }

  for (const matcher of fallbackMatchers) {
    const found = items.find((item) => matcher.test(String(item?.label || item?.value || '')))
    if (found) {
      return found.value
    }
  }

  return items[0]?.value || null
}

const VIRTUAL_DEVICE_MATCHER = /black\s?hole|loopback|soundflower|vb[-\s]?cable|voicemeeter|virtual|aggregate|wiretap|dante/i
const AUTO_RECORD_START_THRESHOLD = 2
const AUTO_RECORD_START_HOLD_MS = 200
const AUTO_RECORD_STOP_ZERO_COUNT = 3

const buildAutoRecordingFileName = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `auto-recording-${timestamp}.flac`
}

const findVirtualDevice = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null
  }

  return items.find((item) => {
    const name = String(item?.label || item?.value || '')
    return item?.kind === 'virtual' || VIRTUAL_DEVICE_MATCHER.test(name)
  }) || null
}

const RecordingPage = () => {
  const { t } = useLanguage()
  const isMacPlatform = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [currentRecordingFileName, setCurrentRecordingFileName] = useState(null);
  const [recordingMode, setRecordingMode] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [enableVolumeWs, setEnableVolumeWs] = useState(true);
  const [enableAutoRecord, setEnableAutoRecord] = useState(false);
  const [externalAudioFlow, setExternalAudioFlow] = useState('idle');
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(null);
  const [switchingOutputDevice, setSwitchingOutputDevice] = useState(false);
  const [livePlaybackEnabled, setLivePlaybackEnabled] = useState(false);
  const [livePlaybackLoading, setLivePlaybackLoading] = useState(false);
  const [livePlaybackUnavailable, setLivePlaybackUnavailable] = useState(isMacPlatform);
  const [activeControl, setActiveControl] = useState(null);
  const [ws, setWs] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [useTarget, setUseTarget] = useState(null);
  const [useNewName, setUseNewName] = useState('');
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const volumeValueRef = useRef(null);
  const animationRef = useRef(null);
  const volumeTargetRef = useRef(0);
  const volumeDisplayRef = useRef(0);
  const isRecordingRef = useRef(false);
  const recordingModeRef = useRef(null);
  const enableAutoRecordRef = useRef(false);
  const externalAudioFlowRef = useRef('idle');
  const externalAutoMonitorSinceRef = useRef(null);
  const externalAutoSilenceZeroCountRef = useRef(0);
  const externalAutoTriggeringRef = useRef(false);
  const externalAutoStoppingRef = useRef(false);
  const externalAutoSessionRef = useRef(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    recordingModeRef.current = recordingMode;
  }, [recordingMode]);

  useEffect(() => {
    enableAutoRecordRef.current = enableAutoRecord;
  }, [enableAutoRecord]);

  useEffect(() => {
    externalAudioFlowRef.current = externalAudioFlow;
  }, [externalAudioFlow]);

  const setStatusMessage = (type, message) => {
    setStatus({ type, message });
  };

  const clearStatus = () => {
    setStatus({ type: '', message: '' });
  };

  const isOperationLocked = Boolean(activeControl || loading || livePlaybackLoading || switchingOutputDevice);
  const isRecordingLocked = Boolean(activeControl === 'recording' || isRecording);
  const isLivePlaybackLocked = Boolean(activeControl === 'live-playback' || livePlaybackLoading);
  const isExternalAudioLocked = Boolean(activeControl === 'external-audio' || loading || isRecording || livePlaybackEnabled || livePlaybackLoading || switchingOutputDevice || externalAudioFlow !== 'idle');
  const isExternalAudioRecording = isRecording && recordingMode === 'external';
  const isNormalRecording = isRecording && recordingMode !== 'external';

  const resetVolumeDisplay = useCallback(() => {
    volumeTargetRef.current = 0;
    volumeDisplayRef.current = 0;
    if (volumeValueRef.current) {
      volumeValueRef.current.textContent = t('Current volume: 0%', '当前音量: 0%');
    }
  }, [t]);

  const closeVolumeSocket = useCallback(() => {
    if (ws && ws.close) {
      try { ws.close(); } catch (e) { }
    }
    setWs(null);
    setWsConnected(false);
    resetVolumeDisplay();
  }, [resetVolumeDisplay, ws]);

  const resetExternalAutoRuntime = () => {
    externalAutoMonitorSinceRef.current = null;
    externalAutoSilenceZeroCountRef.current = 0;
    externalAutoTriggeringRef.current = false;
    externalAutoStoppingRef.current = false;
  };

  const stopRecordingTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const updateExternalAudioFlow = (nextFlow) => {
    externalAudioFlowRef.current = nextFlow;
    setExternalAudioFlow(nextFlow);
  };

  const restoreExternalAudioSession = async () => {
    const session = externalAutoSessionRef.current;
    externalAutoSessionRef.current = null;

    if (!session) {
      return;
    }

    const { previousInput, previousOutput, hadLivePlayback } = session;
    setSelectedDevice(previousInput || null);
    setSelectedOutputDevice(previousOutput || null);

    if (previousOutput && previousOutput !== session.virtualOutput) {
      try {
        setSwitchingOutputDevice(true);
        const restoreResult = await switchOutputDevice(previousOutput);
        if (!restoreResult || !restoreResult.success) {
          throw new Error((restoreResult && restoreResult.message) || t('Failed to restore output device', '恢复输出设备失败'));
        }
      } catch (restoreErr) {
        console.error('Failed to restore output device:', restoreErr)
      } finally {
        setSwitchingOutputDevice(false);
      }
    }

    if (hadLivePlayback) {
      try {
        await startLivePlayback(previousInput || null, previousOutput || null);
      } catch (restartErr) {
        console.error('Failed to restore live monitoring:', restartErr)
      }
    }
  };

  const stopExternalAudioMonitoring = async () => {
    updateExternalAudioFlow('idle');
    resetExternalAutoRuntime();
    closeVolumeSocket();
    setActiveControl('external-audio');
    try {
      await restoreExternalAudioSession();
    } finally {
      setActiveControl(null);
    }
  };

  const startExternalAudioRecordingFromMonitor = async () => {
    const session = externalAutoSessionRef.current;
    if (!session || externalAudioFlowRef.current !== 'monitoring' || isRecordingRef.current) {
      return;
    }

    externalAutoTriggeringRef.current = true;
    updateExternalAudioFlow('recording');

    try {
      await startRecordingWithDevice(session.virtualInput, 'external', {
        skipVolumeSubscribe: true,
        outFileName: session.autoFileName || buildAutoRecordingFileName(),
      });
      setStatusMessage('success', t('Auto recording started successfully.', '自动开始录制成功'));
    } catch (err) {
      externalAutoTriggeringRef.current = false;
      updateExternalAudioFlow('monitoring');
      setStatusMessage('error', t(`Failed to start auto recording: ${err.message}`, `自动开始录制失败: ${err.message}`));
    }
  };

  const handleAutoRecordVolume = (volumeValue) => {
    const volume = Math.max(0, Math.min(100, Number(volumeValue) || 0));
    const now = Date.now();
    if (enableAutoRecordRef.current && externalAudioFlowRef.current === 'monitoring' && !isRecordingRef.current) {
      if (volume > AUTO_RECORD_START_THRESHOLD) {
        if (!externalAutoMonitorSinceRef.current) {
          externalAutoMonitorSinceRef.current = now;
        }

        if (!externalAutoTriggeringRef.current && now - externalAutoMonitorSinceRef.current >= AUTO_RECORD_START_HOLD_MS) {
          void startExternalAudioRecordingFromMonitor();
        }
      } else {
        externalAutoMonitorSinceRef.current = null;
      }
    }

    if (enableAutoRecordRef.current && externalAudioFlowRef.current === 'recording' && isRecordingRef.current && recordingModeRef.current === 'external') {
      if (volume <= 0) {
        externalAutoSilenceZeroCountRef.current += 1;

        if (!externalAutoStoppingRef.current && externalAutoSilenceZeroCountRef.current >= AUTO_RECORD_STOP_ZERO_COUNT) {
          externalAutoStoppingRef.current = true;
          void stopRecordingHandler('auto');
        }
      } else {
        if (externalAutoSilenceZeroCountRef.current !== 0) {
          console.log('[auto-record][silence-reset]', {
            previousZeroCount: externalAutoSilenceZeroCountRef.current,
            nextVolume: volume,
          });
          setStatusMessage('info', t('Sound detected. Silence counter reset.', '检测到声音，静音计数已重置'));
        }
        externalAutoSilenceZeroCountRef.current = 0;
      }
    }
  };

  const isVolumeSocketOpen = () => {
    try {
      return Boolean(ws && typeof ws.readyState === 'function' && ws.readyState() === WebSocket.OPEN);
    } catch {
      return false;
    }
  };

  const ensureVolumeMonitoringForLivePlayback = async (deviceArg = selectedDevice) => {
    if (!enableVolumeWs) {
      setEnableVolumeWs(true);
    }

    if (!isVolumeSocketOpen()) {
      const socket = await connectVolumeSocket(deviceArg);
      subscribeVolumeSocket(socket, 'live-mic-playback', deviceArg || null);
      return socket;
    }

    subscribeVolumeSocket(ws, 'live-mic-playback', deviceArg || null);
    return ws;
  };

  const stopLivePlaybackProcess = async () => {
    try {
      await stopLiveMicPlayback();
    } catch (err) {
      console.error('Failed to stop live monitoring:', err)
    }
  };

  const stopLivePlayback = async () => {
    try {
      setActiveControl('live-playback');
      await stopLivePlaybackProcess();
    } finally {
      closeVolumeSocket();
      setLivePlaybackEnabled(false);
      setLivePlaybackLoading(false);
      setActiveControl(null);
    }
  };

  const startLivePlayback = async (inputDevice = selectedDevice, outputDevice = selectedOutputDevice) => {
    if (livePlaybackUnavailable) {
      throw new Error(t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听'));
    }

    setActiveControl('live-playback');
    setLivePlaybackLoading(true);
    clearStatus();

    const shouldEnableWs = !enableVolumeWs;

    try {
      const result = await startLiveMicPlayback(inputDevice || null, outputDevice || null);
      if (!result || !result.success) {
        throw new Error((result && result.error) || t('Failed to start live monitoring', '启动实时监听失败'));
      }

      await ensureVolumeMonitoringForLivePlayback(inputDevice);
      setLivePlaybackEnabled(true);
      setLivePlaybackLoading(false);
    } catch (error) {
      try {
        await stopLivePlaybackProcess();
      } catch (stopError) {
        console.error('回滚实时监听失败:', stopError);
      }

      if (shouldEnableWs) {
        setEnableVolumeWs(false);
      }

      throw error;
    } finally {
      setActiveControl(null);
    }
  };

  const connectVolumeSocket = async (deviceArg = selectedDevice) => {
    const socket = await wsClientService.connect(`volume-${deviceArg}`,
      (data) => {
        let nextVolume = 0;
        if (typeof data === 'number') {
          nextVolume = Math.max(0, Math.min(100, Number(data) || 0));
        } else if (data && data.volume !== undefined) {
          nextVolume = Math.max(0, Math.min(100, Number(data.volume) || 0));
        }
        volumeTargetRef.current = nextVolume;
        handleAutoRecordVolume(nextVolume);
      },
      () => {
        setWsConnected(true);
        console.log('[WS] connected');
      },
      () => {
        setWsConnected(false);
        console.log('[WS] disconnected');
      },
      (msg) => {
        console.log('[WS] message:', msg);
      }
    );

    setWs(socket);
    return socket;
  };

  const subscribeVolumeSocket = (socket, fileName, deviceArg) => {
    if (!socket || !fileName) {
      return;
    }

    wsClientService.sendJsonAsText(socket, {
      type: 'subscribe-volume',
      data: { fileName, device: deviceArg }
    });
  };

  // 检查浏览器是否支持录音功能
  const checkSupport = () => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  // 加载录音列表
  const loadRecordings = useCallback(async () => {
    try {
      const result = await getRecordingList();
      if (result.success) {
        setRecordings(result.data);
      }
    } catch (err) {
      setStatusMessage('error', t('Failed to load recordings: ', '加载录音列表失败: ') + err.message);
    }
  }, [t]);

  // 初始化录音状态
  useEffect(() => {
    loadRecordings();

    // fetch available input/output devices from backend for platform-appropriate selection
    (async () => {
      try {
        const musicPlay = await import('../services/musicPlay');
        const devRes = await musicPlay.listInputDevices();
        if (devRes && devRes.success) {
          const raw = devRes.raw || '';
          const plat = devRes.platform || '';
          setLivePlaybackUnavailable(plat === 'darwin' || isMacPlatform);
            let parsed = normalizeDeviceList(Array.isArray(devRes.devices) ? devRes.devices : [], t);

          // fallback: if structured devices are unavailable, keep the legacy raw parsing
          if (parsed.length === 0) {
            if (plat === 'darwin') {
              const lines = raw.split(/\r?\n/);
              let inAudio = false;
              for (const line of lines) {
                const l = line.trim();
                if (!l) continue;
                if (/AVFoundation audio devices/i.test(l)) {
                  inAudio = true;
                  continue;
                }
                if (/AVFoundation video devices/i.test(l)) {
                  inAudio = false;
                  continue;
                }
                if (inAudio) {
                  const m = l.match(/\[(?:.*?)\]\s*\[(\d+)\]\s*(.+)$/);
                  if (m) {
                    const idx = m[1];
                    const name = m[2];
                    parsed.push({ label: `${name} (${t('Input', '输入')})`, value: `:${idx}` });
                  }
                }
              }
            }

            if (parsed.length === 0) {
              const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              parsed = lines.map((l) => ({ label: l, value: l }));
            }
          }

          setDevices(parsed);
          if (parsed.length) {
            const defaultDevice = pickDefaultDeviceValue(parsed, [
              /macbook|built-?in|internal|default/i,
              /microphone|default|loopback/i,
              /pulse|alsa/i,
            ]);

            setSelectedDevice(defaultDevice);
          }
        }

        const outRes = await musicPlay.listOutputDevices();
        if (outRes && outRes.success) {
          let parsed = normalizeDeviceList(Array.isArray(outRes.devices) ? outRes.devices : [], t);

          if (parsed.length === 0) {
            const raw = outRes.raw || '';
            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            parsed = lines
              .filter((line) => !/^audio:$/i.test(line) && !/^devices:$/i.test(line))
              .map((l, i) => ({ label: l.length > 120 ? `${l.substring(0, 120)}…` : l, value: l || String(i) }));
          }

          setOutputDevices(parsed);
          if (parsed.length) {
            setSelectedOutputDevice(parsed.find((d) => d.isDefault)?.value || parsed[0].value);
          }
        }
      } catch (e) {
        // ignore device listing errors
      }
    })();
    // no-op: WebSocket will be connected when user clicks Start

    return () => {
      // close any open SSE/WebSocket stored in state
      try {
        if (ws && ws.close) ws.close();
      } catch (e) { }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isMacPlatform, loadRecordings, ws]);

  useEffect(() => {
    if (!isRecording && !livePlaybackEnabled) {
      volumeTargetRef.current = 0;
      volumeDisplayRef.current = 0;
      if (volumeValueRef.current) {
        volumeValueRef.current.textContent = t('Current volume: 0%', '当前音量: 0%');
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const target = Math.max(0, Math.min(100, Number(volumeTargetRef.current || 0)));
      const current = Number(volumeDisplayRef.current || 0);
      const delta = target - current;
      const next = Math.abs(delta) < 0.35 ? target : current + delta * 0.24;

      volumeDisplayRef.current = next;

      const displayVolume = Math.round(next);
      if (volumeValueRef.current) {
        volumeValueRef.current.textContent = t(`Current volume: ${displayVolume}%`, `当前音量: ${displayVolume}%`);
      }

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const barWidth = 10;
        const barCount = Math.floor(width / (barWidth + 2));
        const barHeight = (displayVolume / 100) * height;

        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < barCount; i += 1) {
          const offset = Math.sin(Date.now() / 200 + i) * (barHeight / 4);
          const currentHeight = Math.max(5, barHeight + offset);
          const hue = displayVolume > 70 ? 0 : displayVolume > 40 ? 30 : 120;
          ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;

          const x = i * (barWidth + 2);
          const y = height - currentHeight;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, currentHeight, 3);
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isRecording, livePlaybackEnabled]);

  // 开始录音
  const startRecordingWithDevice = async (deviceArg, mode = 'normal', options = {}) => {
    const { skipVolumeSubscribe = false, outFileName = null } = options || {};

    if (livePlaybackEnabled || livePlaybackLoading) {
      setStatusMessage('warning', t('Stop live monitoring before starting a recording.', '请先停止实时监听，再开始录音'));
      return;
    }

    setActiveControl('recording');
    setLoading(true);
    // clear any previous errors when user retries
    clearStatus();
    let socket = null;

    try {
      if (enableVolumeWs && !skipVolumeSubscribe) {
        // 第1步：按需连接 WebSocket（仅勾选时显示音量）
        socket = await connectVolumeSocket();
      } else if (enableVolumeWs && skipVolumeSubscribe) {
        socket = isVolumeSocketOpen() ? ws : null;
      } else {
        closeVolumeSocket();
      }

      // 第2步：启动后端录音（通过 HTTP）
      const res = await startRecordingBackend({ clientId: null, device: deviceArg, outFileName });
      if (!res || !res.success) {
        throw new Error((res && res.error) || t('Failed to start backend recording', 'start backend failed'));
      }

      // 第3步：从响应获取文件名并设置状态
      const { fileName } = (res && res.data) ? res.data : {};
      if (!fileName) {
        throw new Error(t('No file name was returned.', 'no fileName returned'));
      }

      setCurrentRecordingFileName(fileName);
      setIsRecording(true);
      setRecordingMode(mode);
      setRecordingTime(0);
      setStatusMessage('success', mode === 'external' ? t('External audio recording started.', '外部音频录制已开始') : t('Recording started.', '录音已开始'));

      if (!skipVolumeSubscribe && enableVolumeWs && socket) {
        // 第4步：发送订阅命令，让服务端知道这个客户端要接收该录音的音量
        subscribeVolumeSocket(socket, fileName, deviceArg);
      }

      // 第5步：启动计时器
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setStatusMessage('error', t(`Recording failed: ${err.message}`, `录音失败: ${err.message}`));
      console.error('Recording error:', err);
      // 出错时清理 WebSocket
      if (socket && socket.close) {
        try { socket.close(); } catch (e) { }
      }
      setWs(null);
      setWsConnected(false);
      throw err;
    } finally {
      setLoading(false);
      setActiveControl(null);
    }
  };

  // 录制外部音频：自动切换到虚拟输入/输出设备并开始录音
  const recordExternalAudioHandler = async () => {
    if (isNormalRecording || loading || livePlaybackLoading || switchingOutputDevice) {
      setStatusMessage('warning', t('Another recording operation is in progress. Please try again later.', '当前正在处理其他录音操作，请稍后再试'));
      return;
    }

    if (isExternalAudioRecording) {
      await stopRecordingHandler();
      return;
    }

    if (externalAudioFlowRef.current === 'monitoring') {
      await stopExternalAudioMonitoring();
      return;
    }

    const virtualInput = findVirtualDevice(devices);
    const virtualOutput = findVirtualDevice(outputDevices);
    const previousInput = selectedDevice;
    const previousOutput = selectedOutputDevice;

    if (!virtualInput) {
      setStatusMessage('warning', t('No virtual input device was found. Install BlackHole, Loopback, or a similar device first.', '未找到虚拟输入设备，请先安装 BlackHole、Loopback 或类似设备'));
      return;
    }

    if (!virtualOutput) {
      setStatusMessage('warning', t('No virtual output device was found. Install BlackHole, Loopback, or a similar device first.', '未找到虚拟输出设备，请先安装 BlackHole、Loopback 或类似设备'));
      return;
    }

    let restoreLivePlayback = false;

    try {
      setActiveControl('external-audio');
      setLoading(true);
      clearStatus();

      if (livePlaybackEnabled) {
        restoreLivePlayback = true;
        await stopLivePlayback();
      }

      setSelectedDevice(virtualInput.value);
      setSelectedOutputDevice(virtualOutput.value);

      setSwitchingOutputDevice(true);
      const switchResult = await switchOutputDevice(virtualOutput.value);
      if (!switchResult || !switchResult.success) {
        throw new Error((switchResult && switchResult.message) || t('Failed to switch the virtual output device', '切换虚拟输出设备失败'));
      }

      if (enableAutoRecordRef.current) {
        const socket = isVolumeSocketOpen() ? ws : await connectVolumeSocket(virtualInput.value);
        const autoFileName = buildAutoRecordingFileName();
        externalAutoSessionRef.current = {
          previousInput,
          previousOutput,
          virtualInput: virtualInput.value,
          virtualOutput: virtualOutput.value,
          hadLivePlayback: livePlaybackEnabled,
          autoFileName,
        };

        if (socket) {
          const autoMonitorKey = `external-auto-${Date.now()}`;
          wsClientService.sendJsonAsText(socket, {
            type: 'subscribe-volume',
            data: { fileName: autoMonitorKey, device: virtualInput.value }
          });
        }

        resetExternalAutoRuntime();
        updateExternalAudioFlow('monitoring');
        setLoading(false);
        setActiveControl(null);
        return;
      }

      await startRecordingWithDevice(virtualInput.value, 'external');
    } catch (err) {
      setSelectedDevice(previousInput);
      setSelectedOutputDevice(previousOutput);

      if (previousOutput && previousOutput !== virtualOutput.value) {
        try {
          await switchOutputDevice(previousOutput);
        } catch (restoreOutputErr) {
          console.error('Failed to restore output device:', restoreOutputErr)
        }
      }

      if (restoreLivePlayback) {
        try {
          await startLivePlayback(previousInput, previousOutput);
        } catch (restartErr) {
          console.error('Failed to restore live monitoring:', restartErr)
        }
      }

      updateExternalAudioFlow('idle');
      resetExternalAutoRuntime();
      setStatusMessage('error', t(`Failed to record external audio: ${err.message}`, `录制外部音频失败: ${err.message}`))
    } finally {
      setSwitchingOutputDevice(false)
      setLoading(false)
      setActiveControl(null)
    }
  }

  const startRecordingHandler = async () => {
    setActiveControl('recording');
    try {
      await startRecordingWithDevice(selectedDevice || null, 'normal')
    } catch (err) {
      // error already surfaced by startRecordingWithDevice
    } finally {
      setActiveControl(null);
    }
  };

  // 停止录音
  const stopRecordingHandler = async (triggerType = 'manual') => {
    console.log('stopRecordingHandler called', { triggerType, isRecording, currentRecordingFileName });
    if (currentRecordingFileName) {
      setActiveControl('recording');
      setLoading(true);
      try {
        // stop backend recording via HTTP
        await stopRecordingBackend(currentRecordingFileName);
      } catch (e) {
        if (triggerType === 'auto' && /不存在或未激活|not active|not-running/i.test(String(e?.message || e || ''))) {
          console.log('Auto stop ignored because recording was already inactive', { triggerType, currentRecordingFileName });
        } else {
          console.error('Failed to stop backend recording', e);
        }
      } finally {
        if (triggerType !== 'auto') {
          setIsRecording(false);
          setRecordingMode(null);
          externalAutoStoppingRef.current = false;
          closeVolumeSocket();
          await stopLivePlayback();
          updateExternalAudioFlow('idle');
          await restoreExternalAudioSession();
          resetExternalAutoRuntime();
        } else {
          externalAutoStoppingRef.current = true;
        }
        setStatusMessage('success', t('Recording stopped and state restored.', '录音已停止，状态已恢复'));

        stopRecordingTimer();

        // refresh recordings
        await loadRecordings();
        setLoading(false);
        setActiveControl(null);
      }
    }
  };

  // 格式化时间为 MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    const sizeInBytes = Number(bytes || 0)
    if (sizeInBytes < 1000 * 1024) {
      return `${(sizeInBytes / 1024).toFixed(1)} KB`
    }

    return `${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`
  };

  // 删除录音
  const deleteRecordingItem = async (filename) => {
    try {
      const result = await deleteRecording(filename);
      if (result.success) {
        loadRecordings(); // refresh list
      } else {
        setStatusMessage('error', t(`Failed to delete recording: ${result.message}`, '删除录音失败: ' + result.message));
      }
    } catch (err) {
      setStatusMessage('error', t(`Failed to delete recording: ${err.message}`, `删除录音失败: ${err.message}`));
    }
  };

  const confirmDeleteRecording = (filename) => {
    setDeleteTarget(filename);
    setDeleteDialogOpen(true);
  };

  const openUseRecordingDialog = (filename) => {
    // default name: strip leading timestamp-uid- if present
    const defaultName = String(filename || '').replace(/^\d+-\d+-/, '');
    setUseTarget(filename);
    setUseNewName(defaultName);
    setUseDialogOpen(true);
  };

  const handleConfirmUse = async () => {
    if (!useTarget) return;
    setUseDialogOpen(false);
    try {
      await recordingUse(useTarget, useNewName);
      // refresh recordings list after copying
      await loadRecordings();
    } catch (err) {
      setStatusMessage('error', t(`Failed to use recording: ${(err && err.message) ? err.message : err}`, `使用录音失败: ${(err && err.message) ? err.message : err}`));
    } finally {
      setUseTarget(null);
    }
  };

  const handleCancelUse = () => {
    setUseDialogOpen(false);
    setUseTarget(null);
  };

  const clearAllRecordings = async () => {
    try {
      setLoading(true);
      const names = recordings.map(r => r.filename).filter(Boolean);
      await Promise.all(names.map(n => deleteRecording(n).catch(() => null)));
      await loadRecordings();
    } catch (err) {
      setStatusMessage('error', t(`Failed to clear recordings: ${(err && err.message) ? err.message : err}`, `清空录音失败: ${(err && err.message) ? err.message : err}`));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteDialogOpen(false);
    try {
      await deleteRecordingItem(deleteTarget);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const handleToggleVolumeWs = async (event) => {
    const nextEnabled = event.target.checked;
    setEnableVolumeWs(nextEnabled);

    if (!nextEnabled) {
      closeVolumeSocket();
      return;
    }

    if (isRecording && currentRecordingFileName) {
      try {
        const socket = await connectVolumeSocket();
        subscribeVolumeSocket(socket, currentRecordingFileName, selectedDevice || null);
      } catch (err) {
        setEnableVolumeWs(false);
        setStatusMessage('error', t(`Volume WS connection failed: ${err.message}`, `音量 WS 连接失败: ${err.message}`));
      }
    }
  };

  const livePlaybackStatus = switchingOutputDevice
    ? (livePlaybackEnabled ? t('Switching output; restarting live monitoring...', '输出切换中，实时监听重启中...') : t('Switching output device...', '输出设备切换中...'))
    : (livePlaybackUnavailable
      ? t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听')
      : (livePlaybackLoading
        ? t('Starting live monitoring...', '实时监听启动中...')
        : (livePlaybackEnabled ? t('Live monitoring is on and linked to the current output device.', '实时监听中，已联动当前输出设备') : t('Live monitoring is off.', '实时监听已关闭'))));

  const livePlaybackStatusTone = switchingOutputDevice || livePlaybackLoading
    ? 'pending'
    : (livePlaybackUnavailable
      ? 'disconnected'
      : (livePlaybackEnabled ? 'connected' : 'disconnected'));

  const handleOutputDeviceChange = async (event) => {
    const nextDevice = event.target.value;
    const previousDevice = selectedOutputDevice;
    setSelectedOutputDevice(nextDevice);

    try {
      setSwitchingOutputDevice(true);
      const shouldRestartLivePlayback = livePlaybackEnabled;
      if (shouldRestartLivePlayback) {
        await stopLivePlaybackProcess();
      }

      const result = await switchOutputDevice(nextDevice);
      if (!result || !result.success) {
        throw new Error((result && result.message) || t('Failed to switch output device', '切换输出设备失败'));
      }

      if (shouldRestartLivePlayback) {
        await startLivePlayback();
      }
    } catch (err) {
      setSelectedOutputDevice(previousDevice);
      if (livePlaybackEnabled) {
        try {
          await startLivePlayback();
        } catch (restartErr) {
          console.error('Failed to restore live monitoring:', restartErr);
        }
      }
      setStatusMessage('error', t(`Failed to switch output device: ${err.message}`, `切换输出设备失败: ${err.message}`));
    } finally {
      setSwitchingOutputDevice(false);
      setLivePlaybackLoading(false);
    }
  };

  const toggleLivePlaybackHandler = async () => {
    if (livePlaybackUnavailable) {
      setStatusMessage('warning', t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听'));
      return;
    }

    if (livePlaybackEnabled) {
      await stopLivePlayback();
      return;
    }

    if (isRecording || loading || switchingOutputDevice) {
      setStatusMessage('warning', t('Stop recording before enabling live monitoring.', '正在录音时不能开启实时监听，请先停止录音'));
      return;
    }

    try {
      await startLivePlayback();
    } catch (err) {
      setLivePlaybackEnabled(false);
      setStatusMessage('error', t(`Failed to start live monitoring: ${err.message}`, `启动实时监听失败: ${err.message}`));
    } finally {
      setLivePlaybackLoading(false);
    }
  };

  // 播放录音
  const { openFloatingPlayer } = useFloatingAudioPlayer()

  const playRecording = (recording) => {
    if (!recording || !recording.url) return

    try {
      openFloatingPlayer({
        url: recording.url,
        fileName: recording.filename,
        performer: recording.performer || '',
        programName: recording.programName || '',
        savedName: recording.filename,
        syncOnly: false,
      })
    } catch (err) {
      // fallback to simple audio element if provider not available
      if (audioRef.current) {
        audioRef.current.src = recording.url
        audioRef.current.play().catch(e => console.error('Playback failed:', e))
      }
    }
  }

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      try {
        stopLiveMicPlayback();
      } catch (e) { }
      closeVolumeSocket();
    };
  }, [closeVolumeSocket]);

  return (
    <Tooltip.Provider>
      <div className="container music-container">
        <div className="page-actions">
          <Link to="/page" className="back-link">{t('Back to home', '返回首页')}</Link>
          <Link to="/page/settings" className="back-link">{t('Settings', '用户设置')}</Link>
          <Link to="/page/music" className="back-link">{t('Music playback', '音乐播放')}</Link>
        </div>

        <h1>{t('Recorder', '录音机')}</h1>

        <Modal open={deleteDialogOpen} title={t('Confirm delete', '确认删除')} onClose={handleCancelDelete} footer={
          <>
            <button className="row-icon-btn" onClick={handleCancelDelete}>{t('Cancel', '取消')}</button>
            <button className="row-icon-btn row-icon-btn-delete" onClick={handleConfirmDelete}>{t('Delete', '删除')}</button>
          </>
        }>
          <p>{t('Delete this recording? This action cannot be undone.', '确认删除该录音吗？此操作不可恢复。')}</p>
        </Modal>

        <div className="recorder-card home-panel">
          {status.message && (
            <div className={`recorder-status-banner recorder-status-${status.type || 'info'}`}>
              <span className="recorder-status-label">{(status.type || 'info').toUpperCase()}</span>
              <span className="recorder-status-message">{status.message}</span>
            </div>
          )}
          <div className="recorder-controls">
            <div className="recorder-controls-toolbar">
              <div className="recorder-controls-toolbar-actions">
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button
                      className={`recorder-btn recorder-btn-live${livePlaybackEnabled ? ' live-active' : ''}${isLivePlaybackLocked ? ' recorder-btn-active' : ''}`}
                      onClick={toggleLivePlaybackHandler}
                      disabled={livePlaybackUnavailable || loading || switchingOutputDevice || isRecording || enableAutoRecord || externalAudioFlow !== 'idle' || (activeControl && activeControl !== 'live-playback') || (activeControl === 'live-playback' && livePlaybackLoading)}
                      aria-label={livePlaybackUnavailable ? t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听') : (livePlaybackEnabled ? t('Stop live monitoring', '停止实时监听') : t('Start live monitoring', '开启实时监听'))}
                    >
                      <span className="row-icon-btn-graphic" aria-hidden>
                        <Headphones width={14} height={14} />
                      </span>
                      <span style={{ marginLeft: 8 }}>{livePlaybackUnavailable ? t('Unavailable on macOS', 'macOS 不可用') : (livePlaybackEnabled ? t('Stop live monitoring', '停止实时监听') : (livePlaybackLoading ? t('Listening...', '监听中...') : t('Live monitoring to speakers', '实时监听到扬声器')))}</span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {livePlaybackUnavailable
                        ? t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听')
                        : (switchingOutputDevice ? t('Switching output device. Please wait.', '输出设备切换中，请稍候') : (isRecording ? t('Live monitoring cannot be enabled while recording.', '录音中不可开启实时监听') : (livePlaybackEnabled ? t('Click to stop live monitoring.', '点击停止实时监听') : t('Click to start live monitoring to speakers.', '点击开启实时监听到扬声器'))))}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button
                      className={`recorder-btn home-link-btn recorder-btn-external${isExternalAudioRecording ? ' recording' : (externalAudioFlow === 'monitoring' ? ' monitoring' : '')}`}
                      onClick={recordExternalAudioHandler}
                      disabled={!checkSupport() || (externalAudioFlow === 'idle' && (isExternalAudioLocked || (livePlaybackEnabled && !enableAutoRecord)))}
                      aria-label={isExternalAudioRecording ? t('Stop recording', '停止录制') : (externalAudioFlow === 'monitoring' ? t('Stop monitoring', '停止监控') : t('Record external audio', '录制外部音频'))}
                    >
                      <span style={{ marginLeft: 8 }}>{loading ? t('Processing...', '处理中...') : (isExternalAudioRecording ? t('Stop recording', '停止录制') : (externalAudioFlow === 'monitoring' ? t('Stop monitoring', '停止监控') : (enableAutoRecord ? t('Monitor then record', '监控后录制') : t('Record external audio', '录制外部音频'))))}</span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {isExternalAudioRecording
                        ? t('Click to stop recording and restore button state.', '点击停止录制并恢复按钮状态')
                        : (externalAudioFlow === 'monitoring'
                          ? t('Monitoring volume now. Recording will start automatically after the threshold is reached.', '正在监控音量，达到阈值后会自动开始录制')
                          : (enableAutoRecord
                            ? t('Monitor volume first, then start recording automatically when sustained volume is detected.', '先监控音量，检测到持续音量后自动开始录制')
                            : t('Automatically switch to the virtual input/output devices and start recording external audio.', '自动切换到虚拟输入/输出设备并开始录制外部音频')))}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <button
                  className={`recorder-btn home-link-btn${isNormalRecording ? ' recording' : ''}`}
                  onClick={isRecording ? stopRecordingHandler : startRecordingHandler}
                  disabled={!checkSupport() || isExternalAudioRecording || enableAutoRecord || externalAudioFlow !== 'idle' || (activeControl && activeControl !== 'recording') || (!isRecording && (loading || livePlaybackLoading || switchingOutputDevice || livePlaybackEnabled)) || (isRecording && activeControl === 'recording' && loading)}
                  aria-label={isRecording ? t('Stop recording', '停止录音') : t('Record audio', '录制音频')}
                >
                  {isRecording ? <Pause width={14} height={14} /> : <Play width={14} height={14} />}
                  <span style={{ marginLeft: 8 }}>{loading ? t('Processing...', '处理中...') : (isRecording ? t('Stop recording', '停止录音') : t('Record audio', '录制音频'))}</span>
                </button>
              </div>
              {isRecording && (
                <div className="recording-status-lines">
                  <div className="recording-timer">{t('Recording time:', '录制时间:')} {formatTime(recordingTime)}</div>
                  {currentRecordingFileName && (
                    <div className="recording-file-name">{t('Current file:', '当前文件:')} {currentRecordingFileName}</div>
                  )}
                </div>
              )}
            </div>



            <div className="recorder-controls-devices">
              <div className="recording-device-select">
                  <label className="recording-device-label">{t('Choose recording device', '选择录音设备')} </label>
                <select className="recording-select" value={selectedDevice || ''} onChange={(e) => setSelectedDevice(e.target.value)} disabled={isRecording || isRecordingLocked || isOperationLocked || livePlaybackEnabled || enableAutoRecord}>
                    {devices.length === 0 && <option value="">{t('Default device', '默认设备')}</option>}
                  {devices.map((d, idx) => (
                    <option key={idx} value={d.value}>{d.label.length > 120 ? d.label.substring(0, 120) + '…' : d.label}</option>
                  ))}
                </select>
              </div>
              <div className="recording-device-select">
                  <label className="recording-device-label">{t('Choose output device', '选择输出设备')}</label>
                <select className="recording-select" value={selectedOutputDevice || ''} onChange={handleOutputDeviceChange} disabled={isRecording || isRecordingLocked || isOperationLocked || livePlaybackEnabled || enableAutoRecord}>
                    {outputDevices.length === 0 && <option value="">{t('Default output', '默认输出')}</option>}
                  {outputDevices.map((d, idx) => (
                    <option key={idx} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="recorder-controls-status">
              <label className="recording-checkbox recording-checkbox-auto">
                <input
                  type="checkbox"
                  checked={enableAutoRecord}
                  onChange={(e) => {
                    const nextEnabled = e.target.checked;
                    setEnableAutoRecord(nextEnabled);
                    if (nextEnabled) {
                      setStatusMessage('warning', t('Auto recording is enabled. Please keep the network environment relatively stable.', '已启用自动录制，请保持网络环境相对稳定'));
                    } else {
                      clearStatus();
                    }
                  }}
                  disabled={isRecording || isOperationLocked || isRecordingLocked || isLivePlaybackLocked || livePlaybackEnabled || externalAudioFlow !== 'idle'}
                />
                <span className="checkbox-custom"></span>
                {t('Auto record on volume trigger', '音量触发自动录制')}
              </label>
              <label className="recording-checkbox">
                <input type="checkbox" checked={enableVolumeWs} onChange={handleToggleVolumeWs} disabled={isRecording || isOperationLocked || isRecordingLocked || isLivePlaybackLocked || livePlaybackEnabled || externalAudioFlow !== 'idle'} />
                <span className="checkbox-custom"></span>
                {t('Enable volume WS (show volume when enabled)', '启用音量 WS（勾选后显示音量）')}
              </label>
              <div className="live-playback-status">
                <span className={`live-playback-dot ${livePlaybackStatusTone}`}></span>
                <span>{livePlaybackStatus}</span>
              </div>
              <div className="ws-status-indicator">
                {enableVolumeWs && (
                  <>
                    <span className={`ws-status-dot ${wsConnected ? 'connected' : 'disconnected'}`}></span>
                    <span>WS: {wsConnected ? t('Connected', '已连接') : t('Disconnected', '未连接')}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {(isRecording || livePlaybackEnabled || externalAudioFlow === 'monitoring') && enableVolumeWs && (
            <div className="volume-visualizer-card">
              <canvas
                ref={canvasRef}
                width="600"
                height="100"
                className="volume-canvas"
              />
              <div ref={volumeValueRef} className="volume-level">{t('Current volume: 0%', '当前音量: 0%')}</div>
            </div>
          )}
        </div>

        <audio ref={audioRef} style={{ display: 'none' }} controls={false} />

        {recordings.length > 0 && (
          <div className="recording-list-card home-panel">
            <h4 className="recording-list-title">{t('Recordings', '录音列表')}</h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 14 }} />
              <div>
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button
                      className="row-icon-btn row-icon-btn-delete"
                      onClick={clearAllRecordings}
                      disabled={loading || recordings.length === 0}
                      aria-label={t('Clear recordings', '清空录音')}
                    >
                      <span className="row-icon-btn-graphic" aria-hidden>
                        <Trash2 className="row-action-icon" />
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {t('Clear recordings', '清空录音')}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
            </div>
            <div className="recording-list-ul">
              {recordings.map((rec, index) => (
                <div key={index} className="recording-item-card">
                  <div className="recording-info">
                    <span className="recording-name">{rec.filename}</span>
                    <span className="recording-date">{new Date(rec.createdAt).toLocaleString()}</span>
                    <span className="recording-size">{t('Size:', '大小:')} {formatFileSize(rec.size)}</span>
                  </div>
                  <div className="recording-actions">
                    <Tooltip.Root delayDuration={120}>
                      <Tooltip.Trigger asChild>
                        <button className="row-icon-btn row-icon-btn-use" onClick={() => openUseRecordingDialog(rec.filename)} aria-label={t(`Use ${rec.filename}`, `使用 ${rec.filename}`)}>
                          <span className="row-icon-btn-graphic" aria-hidden>
                            <Copy className="row-action-icon" />
                          </span>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                          {t(`Use ${rec.filename}`, `使用 ${rec.filename}`)}
                          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                    <Tooltip.Root delayDuration={120}>
                      <Tooltip.Trigger asChild>
                        <button className={`row-icon-btn row-icon-btn-preview`} onClick={() => playRecording(rec)} aria-label={t(`Preview ${rec.filename}`, `试听 ${rec.filename}`)}>
                          <span className="row-icon-btn-graphic" aria-hidden>
                            <Headphones className="row-action-icon" />
                          </span>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                          {t(`Preview ${rec.filename}`, `试听 ${rec.filename}`)}
                          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                    <Tooltip.Root delayDuration={120}>
                      <Tooltip.Trigger asChild>
                        <button className={`row-icon-btn row-icon-btn-delete`} onClick={() => confirmDeleteRecording(rec.filename)} aria-label={t(`Delete ${rec.filename}`, `删除 ${rec.filename}`)}>
                          <span className="row-icon-btn-graphic" aria-hidden>
                            <Trash2 className="row-action-icon" />
                          </span>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                          {t(`Delete ${rec.filename}`, `删除 ${rec.filename}`)}
                          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Modal open={useDialogOpen} title={t('Use and rename recording', '使用并重命名录音')} onClose={handleCancelUse} footer={
          <>
            <button className="row-icon-btn" onClick={handleCancelUse}>{t('Cancel', '取消')}</button>
            <button className="row-icon-btn" onClick={handleConfirmUse}>{t('Confirm', '确定')}</button>
          </>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label>{t('Rename to:', '重命名为：')}</label>
            <input value={useNewName} onChange={(e) => setUseNewName(e.target.value)} />
          </div>
        </Modal>
      </div>
    </Tooltip.Provider>
  );
};

export default RecordingPage;