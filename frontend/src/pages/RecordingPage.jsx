import { Headphones, Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'

import { useFloatingAudioPlayer } from '../context/floatingAudioPlayerContext'
import { useLanguage } from '../context/languageContext'
import {
  buildAutoRecordingFileName,
  buildExternalAutoMonitorKey,
  findVirtualDevice,
  formatRecordingFileSize,
  formatRecordingTime,
  getCurrentTimestamp,
  supportsRecordingCapture,
  useRecordingCatalog,
} from '../hooks/recording'
import { useRecordingLivePlayback } from '../hooks/recording/useRecordingLivePlayback'
import RecordingList from '../component/Recording/RecordingList'
import { startRecordingBackend, stopRecordingBackend, switchOutputDevice } from '../services/musicPlay'
const AUTO_RECORD_START_THRESHOLD = 2
const AUTO_RECORD_START_HOLD_MS = 200
const AUTO_RECORD_STOP_ZERO_COUNT = 3

const RecordingPage = () => {
  const { t } = useLanguage()
  const isMacPlatform = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
  const {
    recordings,
    loadRecordings,
    devices,
    selectedDevice,
    setSelectedDevice,
    outputDevices,
    selectedOutputDevice,
    setSelectedOutputDevice,
    livePlaybackUnavailable,
  } = useRecordingCatalog({ t, isMacPlatform })
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [currentRecordingFileName, setCurrentRecordingFileName] = useState(null);
  const [recordingMode, setRecordingMode] = useState(null);
  const [enableAutoRecord, setEnableAutoRecord] = useState(false);
  const [externalAudioFlow, setExternalAudioFlow] = useState('idle');
  const [activeControl, setActiveControl] = useState(null);
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

  const {
    wsRef,
    wsConnected,
    enableVolumeWs,
    switchingOutputDevice,
    setSwitchingOutputDevice,
    livePlaybackEnabled,
    livePlaybackLoading,
    closeVolumeSocket,
    connectVolumeSocket,
    subscribeVolumeSocket,
    startLivePlayback,
    stopLivePlayback,
    handleToggleVolumeWs,
    handleOutputDeviceChange,
    toggleLivePlaybackHandler,
    livePlaybackStatus,
    livePlaybackStatusTone,
    isVolumeSocketOpen,
  } = useRecordingLivePlayback({
    t,
    selectedDevice,
    selectedOutputDevice,
    setSelectedDevice,
    setSelectedOutputDevice,
    isRecording,
    loading,
    livePlaybackUnavailable,
    setStatusMessage,
    clearStatus,
    setActiveControl,
    volumeTargetRef,
    volumeDisplayRef,
    volumeValueRef,
  })

  const isOperationLocked = Boolean(activeControl || loading || livePlaybackLoading || switchingOutputDevice);
  const isRecordingLocked = Boolean(activeControl === 'recording' || isRecording);
  const isLivePlaybackLocked = Boolean(activeControl === 'live-playback' || livePlaybackLoading);
  const isExternalAudioLocked = Boolean(activeControl === 'external-audio' || loading || isRecording || livePlaybackEnabled || livePlaybackLoading || switchingOutputDevice || externalAudioFlow !== 'idle');
  const isExternalAudioRecording = isRecording && recordingMode === 'external';
  const isNormalRecording = isRecording && recordingMode !== 'external';

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
    const now = getCurrentTimestamp();
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

  // close animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

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
          const offset = Math.sin(getCurrentTimestamp() / 200 + i) * (barHeight / 4);
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
  }, [isRecording, livePlaybackEnabled, t]);

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
        socket = await connectVolumeSocket(selectedDevice, handleAutoRecordVolume);
      } else if (enableVolumeWs && skipVolumeSubscribe) {
        socket = isVolumeSocketOpen() ? wsRef.current : null;
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
      closeVolumeSocket();
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
        const socket = isVolumeSocketOpen() ? wsRef.current : await connectVolumeSocket(virtualInput.value, handleAutoRecordVolume);
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
          const autoMonitorKey = buildExternalAutoMonitorKey();
          subscribeVolumeSocket(socket, autoMonitorKey, virtualInput.value);
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
      void stopLivePlayback();
      closeVolumeSocket();
    };
  }, [closeVolumeSocket, stopLivePlayback]);

  return (
    <Tooltip.Provider>
      <div className="container music-container">
        <div className="page-actions">
          <Link to="/page" className="back-link">{t('Back to home', '返回首页')}</Link>
          <Link to="/page/settings" className="back-link">{t('Settings', '用户设置')}</Link>
          <Link to="/page/music" className="back-link">{t('Music playback', '音乐播放')}</Link>
        </div>

        <h1>{t('Recorder', '录音机')}</h1>

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
                      disabled={!supportsRecordingCapture() || (externalAudioFlow === 'idle' && (isExternalAudioLocked || (livePlaybackEnabled && !enableAutoRecord)))}
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
                  disabled={!supportsRecordingCapture() || isExternalAudioRecording || enableAutoRecord || externalAudioFlow !== 'idle' || (activeControl && activeControl !== 'recording') || (!isRecording && (loading || livePlaybackLoading || switchingOutputDevice || livePlaybackEnabled)) || (isRecording && activeControl === 'recording' && loading)}
                  aria-label={isRecording ? t('Stop recording', '停止录音') : t('Record audio', '录制音频')}
                >
                  {isRecording ? <Pause width={14} height={14} /> : <Play width={14} height={14} />}
                  <span style={{ marginLeft: 8 }}>{loading ? t('Processing...', '处理中...') : (isRecording ? t('Stop recording', '停止录音') : t('Record audio', '录制音频'))}</span>
                </button>
              </div>
              {isRecording && (
                <div className="recording-status-lines">
                  <div className="recording-timer">{t('Recording time:', '录制时间:')} {formatRecordingTime(recordingTime)}</div>
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
          <RecordingList
            recordings={recordings}
            t={t}
            formatRecordingFileSize={formatRecordingFileSize}
            onRefresh={loadRecordings}
            onPreview={playRecording}
            setStatusMessage={setStatusMessage}
          />
        )}
      </div>
    </Tooltip.Provider>
  );
};

export default RecordingPage;