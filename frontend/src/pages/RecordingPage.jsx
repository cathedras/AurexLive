import { Copy, Headphones, Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useFloatingAudioPlayer } from '../component/FloatingAudioPlayer'
import Modal from '../component/Modal'
import { deleteRecording, getRecordingList, startRecordingBackend, stopRecordingBackend, switchOutputDevice, useRecording } from '../services/musicPlay'
import wsClientService from '../services/wsClientService'

const RecordingPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentRecordingFileName, setCurrentRecordingFileName] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [enableVolumeWs, setEnableVolumeWs] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(null);
  const [switchingOutputDevice, setSwitchingOutputDevice] = useState(false);
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

  const resetVolumeDisplay = () => {
    volumeTargetRef.current = 0;
    volumeDisplayRef.current = 0;
    if (volumeValueRef.current) {
      volumeValueRef.current.textContent = '当前音量: 0%';
    }
  };

  const closeVolumeSocket = () => {
    if (ws && ws.close) {
      try { ws.close(); } catch (e) {}
    }
    setWs(null);
    setWsConnected(false);
    setClientId(null);
    resetVolumeDisplay();
  };

  const connectVolumeSocket = async () => {
    const socket = await wsClientService.connect(`volume-${selectedDevice}`,
      (data) => {
        if (typeof data === 'number') {
          volumeTargetRef.current = Math.max(0, Math.min(100, Number(data) || 0));
        } else if (data && data.volume !== undefined) {
          volumeTargetRef.current = Math.max(0, Math.min(100, Number(data.volume) || 0));
        }
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
        if (msg?.type === 'clientId' && msg.data) {
          setClientId(msg.data);
        }
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
  const loadRecordings = async () => {
    try {
      const result = await getRecordingList();
      if (result.success) {
        setRecordings(result.data);
      }
    } catch (err) {
      setError('加载录音列表失败: ' + err.message);
    }
  };

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
          let parsed = [];

          if (plat === 'darwin') {
            // parse avfoundation audio devices section
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
                // match lines like: [..] [0] MacBook Air Microphone
                const m = l.match(/\[(?:.*?)\]\s*\[(\d+)\]\s*(.+)$/);
                if (m) {
                  const idx = m[1];
                  const name = m[2];
                  parsed.push({ label: `${name} (index ${idx})`, value: `:${idx}` });
                }
              }
            }
          }

          // fallback: if no parsed entries, show raw lines as options
          if (parsed.length === 0) {
            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            parsed = lines.map((l, i) => ({ label: l, value: l }));
          }

          setDevices(parsed);
          if (parsed.length) {
            // Pick a sensible default based on detected platform
            let defaultDevice;
            if (plat === 'darwin') {
              // prefer built-in/internal microphones when available
              defaultDevice = parsed.find(d => /macbook|built-?in|internal|default/i.test(d.label))?.value || parsed[0].value;
            } else if (plat === 'win32' || plat === 'windows') {
              // prefer entries mentioning Microphone or Default on Windows
              defaultDevice = parsed.find(d => /microphone|default|loopback/i.test(d.label))?.value || parsed[0].value;
            } else if (plat === 'linux') {
              // prefer pulse/alsa/default on Linux
              defaultDevice = parsed.find(d => /default|pulse|alsa/i.test(d.label))?.value || parsed[0].value;
            } else {
              defaultDevice = parsed[0].value;
            }

            setSelectedDevice(defaultDevice);
          }
        }

        const outRes = await musicPlay.listOutputDevices();
        if (outRes && outRes.success) {
          const structured = Array.isArray(outRes.devices) ? outRes.devices : [];
          let parsed = structured.map((item) => ({
            label: item.isDefault ? `${item.label}（默认）` : item.label,
            value: item.value,
          }));

          if (parsed.length === 0) {
            const raw = outRes.raw || '';
            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            parsed = lines
              .filter((line) => !/^audio:$/i.test(line) && !/^devices:$/i.test(line))
              .map((l, i) => ({ label: l.length > 120 ? `${l.substring(0, 120)}…` : l, value: l || String(i) }));
          }

          setOutputDevices(parsed);
          if (parsed.length) {
            setSelectedOutputDevice(parsed.find((d) => /默认/.test(d.label))?.value || parsed[0].value);
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
      } catch (e) {}

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      volumeTargetRef.current = 0;
      volumeDisplayRef.current = 0;
      if (volumeValueRef.current) {
        volumeValueRef.current.textContent = '当前音量: 0%';
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
        volumeValueRef.current.textContent = `当前音量: ${displayVolume}%`;
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
  }, [isRecording]);

  // 开始录音
  const startRecordingHandler = async () => {
    if (!checkSupport()) {
      setError('您的浏览器不支持录音功能');
      return;
    }

    setLoading(true);
    // clear any previous errors when user retries
    setError('');
    let socket = null;

    try {
      if (enableVolumeWs) {
        // 第1步：按需连接 WebSocket（仅勾选时显示音量）
        socket = await connectVolumeSocket();
      } else {
        closeVolumeSocket();
      }

      // 第2步：启动后端录音（通过 HTTP）
      const deviceArg = selectedDevice || null;
      const res = await startRecordingBackend({ clientId: null, device: deviceArg });
      if (!res || !res.success) {
        throw new Error((res && res.error) || 'start backend failed');
      }

      // 第3步：从响应获取文件名并设置状态
      const { fileName } = (res && res.data) ? res.data : {};
      if (!fileName) {
        throw new Error('no fileName returned');
      }

      setCurrentRecordingFileName(fileName);
      setIsRecording(true);
      setRecordingTime(0);

      if (enableVolumeWs && socket) {
        // 第4步：发送订阅命令，让服务端知道这个客户端要接收该录音的音量
        subscribeVolumeSocket(socket, fileName, deviceArg);
      }

      // 第5步：启动计时器
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setError(`录音失败: ${err.message}`);
      console.error('录音错误:', err);
      // 出错时清理 WebSocket
      if (socket && socket.close) {
        try { socket.close(); } catch (e) {}
      }
      setWs(null);
      setWsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  // 停止录音
  const stopRecordingHandler = async () => {
    if (isRecording && currentRecordingFileName) {
      try {
        // stop backend recording via HTTP
        await stopRecordingBackend(currentRecordingFileName);
      } catch (e) {
        console.error('stop backend failed', e);
      }
      setIsRecording(false);
      closeVolumeSocket();

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // refresh recordings
      loadRecordings();
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
        loadRecordings(); // 刷新录音列表
      } else {
        setError('删除录音失败: ' + result.message);
      }
    } catch (err) {
      setError('删除录音失败: ' + err.message);
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
      await useRecording(useTarget, useNewName);
      // refresh recordings list after copying
      await loadRecordings();
    } catch (err) {
      setError('使用录音失败: ' + (err && err.message ? err.message : err));
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
      await Promise.all(names.map(n => deleteRecording(n).catch(e => null)));
      await loadRecordings();
    } catch (err) {
      setError('清空录音失败: ' + (err && err.message ? err.message : err));
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
        setError(`音量 WS 连接失败: ${err.message}`);
      }
    }
  };

    const handleOutputDeviceChange = async (event) => {
      const nextDevice = event.target.value;
      const previousDevice = selectedOutputDevice;
      setSelectedOutputDevice(nextDevice);

      try {
        setSwitchingOutputDevice(true);
        const result = await switchOutputDevice(nextDevice);
        if (!result || !result.success) {
          throw new Error((result && result.message) || '切换输出设备失败');
        }
      } catch (err) {
        setSelectedOutputDevice(previousDevice);
        setError(`切换输出设备失败: ${err.message}`);
      } finally {
        setSwitchingOutputDevice(false);
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
        audioRef.current.play().catch(e => console.error('播放失败:', e))
      }
    }
  }

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="container music-container">
      <div className="page-actions">
        <Link to="/page" className="back-link">返回首页</Link>
        <Link to="/page/settings" className="back-link">用户设置</Link>
        <Link to="/page/music" className="back-link">音乐播放</Link>
      </div>

      <h1>录音机</h1>

      <Modal open={deleteDialogOpen} title="确认删除" onClose={handleCancelDelete} footer={
        <>
          <button className="row-icon-btn" onClick={handleCancelDelete}>取消</button>
          <button className="row-icon-btn row-icon-btn-delete" onClick={handleConfirmDelete}>删除</button>
        </>
      }>
        <p>确认删除该录音吗？此操作不可恢复。</p>
      </Modal>

      <div className="recorder-card home-panel">
        {error && <div className="recorder-error">{error}</div>}
        <div className="recorder-controls">
          <button
            className={`recorder-btn home-link-btn${isRecording ? ' recording' : ''}`}
              onClick={isRecording ? stopRecordingHandler : startRecordingHandler}
              disabled={!checkSupport() || loading}
            aria-label={isRecording ? '停止录音' : '开始录音'}
          >
            {isRecording ? <Pause width={14} height={14} /> : <Play width={14} height={14} />}
            <span style={{ marginLeft: 8 }}>{loading ? '处理中...' : (isRecording ? '停止录音' : '开始录音')}</span>
          </button>
          <div style={{ marginLeft: 12 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>选择录音设备（原始输出）</label>
            <select value={selectedDevice || ''} onChange={(e) => setSelectedDevice(e.target.value)} disabled={isRecording || loading}>
              {devices.length === 0 && <option value="">默认设备</option>}
              {devices.map((d, idx) => (
                <option key={idx} value={d.value}>{d.label.length > 120 ? d.label.substring(0, 120) + '…' : d.label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: 12 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>选择输出设备</label>
            <select value={selectedOutputDevice || ''} onChange={handleOutputDeviceChange} disabled={isRecording || loading || switchingOutputDevice}>
              {outputDevices.length === 0 && <option value="">默认输出</option>}
              {outputDevices.map((d, idx) => (
                <option key={idx} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <label style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={enableVolumeWs} onChange={handleToggleVolumeWs} />
            启用音量 WS（勾选后显示音量）
          </label>
          <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {enableVolumeWs && (
              <>
                <div style={{ fontSize: 12, color: wsConnected ? '#0a0' : '#a00' }}>
                  WS: {wsConnected ? '已连接' : '未连接'}
                </div>
                {clientId && <div style={{ fontSize: 12 }}>clientId: {clientId}</div>}
              </>
            )}
          </div>
          {isRecording && (
            <span className="recording-timer">录制时间: {formatTime(recordingTime)}</span>
          )}
        </div>
        {isRecording && enableVolumeWs && (
          <div className="volume-visualizer-card">
            <canvas
              ref={canvasRef}
              width="600"
              height="100"
              className="volume-canvas"
            />
            <div ref={volumeValueRef} className="volume-level">当前音量: 0%</div>
          </div>
        )}
      </div>

      <audio ref={audioRef} style={{ display: 'none' }} controls={false} />

      {recordings.length > 0 && (
        <div className="recording-list-card home-panel">
          <h4 className="recording-list-title">录音列表</h4>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 14 }} />
            <div>
              <button
                className="row-icon-btn row-icon-btn-delete"
                onClick={clearAllRecordings}
                disabled={loading || recordings.length===0}
                aria-label="清空录音"
                title="清空录音"
              >
                <span className="row-icon-btn-graphic" aria-hidden>
                  <Trash2 className="row-action-icon" />
                </span>
              </button>
            </div>
          </div>
          <div className="recording-list-ul">
            {recordings.map((rec, index) => (
              <div key={index} className="recording-item-card">
                <div className="recording-info">
                  <span className="recording-name">{rec.filename}</span>
                  <span className="recording-date">{new Date(rec.createdAt).toLocaleString()}</span>
                  <span className="recording-size">大小: {formatFileSize(rec.size)}</span>
                </div>
                <div className="recording-actions">
                  <button className="row-icon-btn row-icon-btn-use" onClick={() => openUseRecordingDialog(rec.filename)} aria-label={`使用 ${rec.filename}`} title={`使用 ${rec.filename}`}>
                    <span className="row-icon-btn-graphic" aria-hidden>
                      <Copy className="row-action-icon" />
                    </span>
                  </button>
                  <button className={`row-icon-btn row-icon-btn-preview`} onClick={() => playRecording(rec)} aria-label={`试听 ${rec.filename}`}>
                    <span className="row-icon-btn-graphic" aria-hidden>
                      <Headphones className="row-action-icon" />
                    </span>
                  </button>
                  <button className={`row-icon-btn row-icon-btn-delete`} onClick={() => confirmDeleteRecording(rec.filename)} aria-label={`删除 ${rec.filename}`}>
                    <span className="row-icon-btn-graphic" aria-hidden>
                      <Trash2 className="row-action-icon" />
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <Modal open={useDialogOpen} title="使用并重命名录音" onClose={handleCancelUse} footer={
        <>
          <button className="row-icon-btn" onClick={handleCancelUse}>取消</button>
          <button className="row-icon-btn" onClick={handleConfirmUse}>确定</button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>重命名为：</label>
          <input value={useNewName} onChange={(e) => setUseNewName(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
};

export default RecordingPage;