import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFloatingAudioPlayer } from '../component/FloatingAudioPlayer'
import { getRecordingList, deleteRecording, startRecording, sendRecordingChunk } from '../services/musicPlay';
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
  const [volume, setVolume] = useState(0);
  const [ws, setWs] = useState(null);
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
    
    // 连接WebSocket获取实时音量数据
    const websocket = new WebSocket(`ws://localhost:3000`);
    
    websocket.onopen = () => {
      console.log('WebSocket连接已建立');
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'clientId') {
        setClientId(data.data);
      } else if (data.type === 'volume') {
        setVolume(data.data.volume);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket错误:', error);
    };
    
    websocket.onclose = () => {
      console.log('WebSocket连接已关闭');
    };
    
    setWs(websocket);
    
    return () => {
      if (websocket) {
        websocket.close();
      }
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

    if (!clientId) {
      setError('尚未连接到服务器');
      return;
    }

    setLoading(true);
    try {
      // 调用后端API开始录音
      const result = await startRecording(clientId);
      if (!result.success) {
        throw new Error(result.message);
      }

      const { fileName } = result.data;
      setCurrentRecordingFileName(fileName);

      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      setAudioChunks([]);

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // 发送音频数据块到后端
          await sendAudioChunk(event.data, fileName);
        }
      };

      recorder.onstop = async () => {
        // 停止所有轨道
        stream.getTracks().forEach(track => track.stop());
        
        // 刷新录音列表
        loadRecordings();
      };

      recorder.start(1000); // 每秒触发一次dataavailable事件
      setIsRecording(true);
      setRecordingTime(0);

      // 开始计时
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError(`录音失败: ${err.message}`);
      console.error('录音错误:', err);
    } finally {
      setLoading(false);
    }
  };

  // 停止录音
  const stopRecordingHandler = async () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
    const ok = window.confirm('确认删除该录音吗？此操作不可恢复。');
    if (!ok) return;
    deleteRecordingItem(filename);
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

      <div className="recorder-card home-panel">
        {error && <div className="recorder-error">{error}</div>}
        <div className="recorder-controls">
          <button
            className={`recorder-btn home-link-btn${isRecording ? ' recording' : ''}`}
            onClick={isRecording ? stopRecordingHandler : startRecordingHandler}
            disabled={!checkSupport() || loading || !clientId}
            aria-label={isRecording ? '停止录音' : '开始录音'}
          >
            {isRecording ? <Pause width={14} height={14} /> : <Play width={14} height={14} />}
            <span style={{ marginLeft: 8 }}>{loading ? '处理中...' : (isRecording ? '停止录音' : '开始录音')}</span>
          </button>
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