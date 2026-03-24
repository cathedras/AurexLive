import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFloatingAudioPlayer } from '../component/FloatingAudioPlayer'
import Modal from '../component/Modal'
import { getRecordingList, deleteRecording, startRecording, sendRecordingChunk, startRecordingBackend, stopRecordingBackend, subscribeRecordingSSE, connectRecordingSocket, wsStartRecordingBackend, wsStopRecording, wsAddChunk } from '../services/musicPlay';
import { Download, Headphones, Trash2, Play, Pause } from 'lucide-react'

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
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [volume, setVolume] = useState(0);
  const [ws, setWs] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

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

    // fetch available devices from backend for platform-appropriate selection
    (async () => {
      try {
        const devRes = await (await import('../services/musicPlay')).listRecordingDevices();
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
          if (parsed.length) setSelectedDevice(parsed[0].value);
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

  // 绘制音量可视化效果
  useEffect(() => {
    if (!canvasRef.current || !isRecording) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 清除画布
    ctx.clearRect(0, 0, width, height);
    
    // 绘制音量柱状图
    const barWidth = 10;
    const barCount = Math.floor(width / (barWidth + 2));
    const barHeight = (volume / 100) * height;
    
    for (let i = 0; i < barCount; i++) {
      // 随机偏移以创建更自然的效果
      const offset = Math.sin(Date.now() / 200 + i) * (barHeight / 4);
      const currentHeight = Math.max(5, barHeight + offset);
      
      // 根据音量改变颜色
      const hue = volume > 70 ? 0 : volume > 40 ? 30 : 120; // 红 -> 黄 -> 绿
      ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
      
      const x = i * (barWidth + 2);
      const y = height - currentHeight;
      
      // 绘制圆角矩形
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, currentHeight, 3);
      ctx.fill();
    }
  }, [volume, isRecording]);

  // 发送音频数据块到后端
  const sendAudioChunk = async (chunk, filename) => {
    try {
      const result = await sendRecordingChunk(chunk, filename);
      if (!result.success) {
        console.error('发送音频数据块失败:', result.message);
      }
    } catch (err) {
      console.error('发送音频数据块时发生错误:', err);
    }
  };

  // 开始录音
  const startRecordingHandler = async () => {
    if (!checkSupport()) {
      setError('您的浏览器不支持录音功能');
      return;
    }

    setLoading(true);
    try {
      // Connect WebSocket now that recording is requested
      const socket = await connectRecordingSocket(
        (data) => { if (data && data.volume !== undefined) setVolume(data.volume || 0); },
        () => setWsConnected(true),
        () => setWsConnected(false),
        (msg) => { if (msg?.type === 'clientId' && msg.data) setClientId(msg.data); }
      );
      setWs(socket);
      setWsConnected(true);

      // Tell backend to start recording (server-side capture) via WebSocket
      const deviceArg = selectedDevice || null;
      const res = await wsStartRecordingBackend({ device: deviceArg, outFileName: null, ffmpegArgs: null });
      if (!res || !res.success) throw new Error((res && res.error) || 'start backend failed');

      // set fileName and recording state from response
      const { fileName } = (res && res.data) ? res.data : {};
      if (fileName) {
        setCurrentRecordingFileName(fileName);
        setIsRecording(true);
        setRecordingTime(0);
      }

      // start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError(`录音失败: ${err.message}`);
      console.error('录音错误:', err);
      // cleanup ws
      try { if (ws && ws.close) ws.close(); } catch (e) {}
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
        // ask backend to stop via WebSocket if available
        if (ws && ws.send) {
          try {
            await wsStopRecording(currentRecordingFileName);
          } catch (e) {
            console.warn('ws stop failed, fallback to HTTP', e);
            await stopRecordingBackend(currentRecordingFileName);
          }
        } else {
          await stopRecordingBackend(currentRecordingFileName);
        }
      } catch (e) {
        console.error('stop backend failed', e);
      }
      setIsRecording(false);
      setVolume(0);

      // close SSE
      if (ws && ws.close) {
        try { ws.close(); } catch (e) {}
      }
      setWs(null);
      setWsConnected(false);

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
          <div style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: wsConnected ? '#0a0' : '#a00' }}>
              WS: {wsConnected ? '已连接' : '未连接'}
            </div>
            {clientId && <div style={{ fontSize: 12 }}>clientId: {clientId}</div>}
          </div>
          {isRecording && (
            <span className="recording-timer">录制时间: {formatTime(recordingTime)}</span>
          )}
        </div>
        {isRecording && (
          <div className="volume-visualizer-card">
            <canvas
              ref={canvasRef}
              width="600"
              height="100"
              className="volume-canvas"
            />
            <div className="volume-level">当前音量: {volume}%</div>
          </div>
        )}
      </div>

      <audio ref={audioRef} style={{ display: 'none' }} controls={false} />

      {recordings.length > 0 && (
        <div className="recording-list-card home-panel">
          <h4 className="recording-list-title">录音列表</h4>
          <div className="recording-list-ul">
            {recordings.map((rec, index) => (
              <div key={index} className="recording-item-card">
                <div className="recording-info">
                  <span className="recording-name">{rec.filename}</span>
                  <span className="recording-date">{new Date(rec.createdAt).toLocaleString()}</span>
                  <span className="recording-size">大小: {(rec.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="recording-actions">
                  <a href={rec.url} className={`row-icon-btn row-icon-btn-create`} download aria-label={`下载 ${rec.filename}`}>
                    <span className="row-icon-btn-graphic" aria-hidden>
                      <Download className="row-action-icon" />
                    </span>
                  </a>
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
    </div>
  );
};

export default RecordingPage;