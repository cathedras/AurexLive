import { useCallback, useEffect, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'
import { Link } from 'react-router-dom'

import {
  closeLiveSession,
  connectLiveTransport,
  createLiveSession,
  createLiveTransport,
  fetchLiveRtpCapabilities,
  produceLiveTrack,
} from '../services/liveStream/liveStreamService'

function LiveStreamPage() {
  const localVideoRef = useRef(null)
  const deviceRef = useRef(null)
  const sessionIdRef = useRef('')
  const sendTransportRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const producerRefs = useRef([])
  const videoProducerRef = useRef(null)
  const currentFacingModeRef = useRef('user')
  const debugEntryIdRef = useRef(0)
  const debugLogTailRef = useRef(null)

  const [status, setStatus] = useState('未连接')
  const [sessionId, setSessionId] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [isLivePublishing, setIsLivePublishing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [facingMode, setFacingMode] = useState('user')
  const [debugLogs, setDebugLogs] = useState([])

  const previewUrl = sessionId
    ? `${window.location.origin}/page/live-preview?sessionId=${encodeURIComponent(sessionId)}`
    : ''

  const appendDebugLog = useCallback((message, data) => {
    const timestamp = new Date().toLocaleTimeString()
    const entry = {
      id: debugEntryIdRef.current += 1,
      timestamp,
      message,
      data,
    }

    console.log(message, data || '')
    setDebugLogs((current) => [...current.slice(-49), entry])
  }, [])

  const clearDebugLogs = () => {
    console.log('🧹 调试窗口已清空')
    setDebugLogs([])
  }

  const stopPublishing = useCallback(async () => {
    producerRefs.current.forEach((producer) => {
      try {
        producer.close()
      } catch {
        // ignore close errors
      }
    })
    producerRefs.current = []

    if (sendTransportRef.current) {
      try {
        sendTransportRef.current.close()
      } catch {
        // ignore close errors
      }
      sendTransportRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (sessionIdRef.current) {
      try {
        await closeLiveSession(sessionIdRef.current)
      } catch {
        // ignore session close errors
      }
      sessionIdRef.current = ''
      setSessionId('')
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }

    deviceRef.current = null
    videoProducerRef.current = null
    currentFacingModeRef.current = 'user'
    setIsLivePublishing(false)
    setStatus('已停止')
    appendDebugLog('🛑 已停止发布')
  }, [appendDebugLog])

  useEffect(() => {
    return () => {
      stopPublishing().catch(() => {})
    }
  }, [stopPublishing])

  useEffect(() => {
    if (!debugLogTailRef.current) {
      return
    }

    debugLogTailRef.current.scrollTop = debugLogTailRef.current.scrollHeight
  }, [debugLogs])

  const attachPreview = async (nextFacingMode = facingMode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: nextFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: true,
    })

    mediaStreamRef.current = stream
    currentFacingModeRef.current = nextFacingMode
    setFacingMode(nextFacingMode)

    appendDebugLog('📱 已获取本地媒体流', {
      facingMode: nextFacingMode,
      videoTracks: stream.getVideoTracks().map((track) => ({
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings?.() || {},
      })),
      audioTracks: stream.getAudioTracks().map((track) => ({
        id: track.id,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings?.() || {},
      })),
    })

    stream.getTracks().forEach((track) => {
      track.onunmute = () => {
        appendDebugLog('✅ 本地 track 开始出帧', {
          kind: track.kind,
          id: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
        })
      }

      track.onmute = () => {
        appendDebugLog('❌ 本地 track 暂停出帧', {
          kind: track.kind,
          id: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
        })
      }

      track.onended = () => {
        appendDebugLog('⛔ 本地 track 已结束', {
          kind: track.kind,
          id: track.id,
          readyState: track.readyState,
        })
      }
    })

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.onloadedmetadata = () => {
        appendDebugLog('📺 本地预览 video 已加载元数据', {
          videoWidth: localVideoRef.current?.videoWidth,
          videoHeight: localVideoRef.current?.videoHeight,
        })
      }
      localVideoRef.current.onplaying = () => {
        appendDebugLog('📺 本地预览 video 正在播放')
      }
      localVideoRef.current.onpause = () => {
        appendDebugLog('📺 本地预览 video 暂停')
      }
      localVideoRef.current.onerror = (event) => {
        appendDebugLog('📺 本地预览 video 出错', event)
      }
    }
    return stream
  }

  const switchCamera = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorMessage('当前设备不支持摄像头切换')
      return
    }

    const nextFacingMode = currentFacingModeRef.current === 'user' ? 'environment' : 'user'
    let nextStream = null
    setErrorMessage('')
    setStatus('切换摄像头中')
    appendDebugLog('🔄 切换摄像头', { from: currentFacingModeRef.current, to: nextFacingMode })

    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      const nextVideoTrack = nextStream.getVideoTracks()[0]
      if (!nextVideoTrack) {
        throw new Error('未获取到视频轨道')
      }

      const currentStream = mediaStreamRef.current
      const currentAudioTracks = currentStream ? currentStream.getAudioTracks() : []

      if (videoProducerRef.current?.replaceTrack) {
        await videoProducerRef.current.replaceTrack({ track: nextVideoTrack })
      }

      if (currentStream) {
        currentStream.getVideoTracks().forEach((track) => track.stop())
        mediaStreamRef.current = new MediaStream([
          nextVideoTrack,
          ...currentAudioTracks,
        ])
      } else {
        mediaStreamRef.current = nextStream
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current
      }

      currentFacingModeRef.current = nextFacingMode
      setFacingMode(nextFacingMode)
      setStatus(nextFacingMode === 'user' ? '已切换到前置摄像头' : '已切换到后置摄像头')
    } catch (error) {
      setErrorMessage(error.message)
      setStatus('切换摄像头失败')
    } finally {
      if (nextStream) {
        try {
          nextStream.getTracks().forEach((track) => {
            if (track.kind !== 'video') {
              track.stop()
            }
          })
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  const ensureDevice = async () => {
    if (deviceRef.current) {
      return deviceRef.current
    }

    const result = await fetchLiveRtpCapabilities()
    if (!result?.success) {
      throw new Error(result?.message || '获取 RTP 能力失败')
    }

    const device = new Device()
    await device.load({ routerRtpCapabilities: result.rtpCapabilities })
    deviceRef.current = device
    return device
  }

  const startPublishing = async () => {
    setErrorMessage('')
    setStatus('准备连接')
    setIsPublishing(true)

    try {
      const device = await ensureDevice()
      appendDebugLog('🚀 开始发布，已获取 mediasoup device')
      const sessionResult = await createLiveSession(sessionIdRef.current)
      if (!sessionResult?.success) {
        throw new Error(sessionResult?.message || '创建会话失败')
      }

      sessionIdRef.current = sessionResult.sessionId
      setSessionId(sessionResult.sessionId)
      appendDebugLog('🧩 会话创建成功', { sessionId: sessionResult.sessionId })

      const stream = await attachPreview()
      const transportResult = await createLiveTransport(sessionResult.sessionId, 'send')
      if (!transportResult?.success) {
        throw new Error(transportResult?.message || '创建传输失败')
      }

      const transportData = transportResult.transport
      const sendTransport = device.createSendTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      })

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        appendDebugLog('🔌 sendTransport connect', {
          transportId: sendTransport.id,
        })
        connectLiveTransport(sendTransport.id, dtlsParameters)
          .then((result) => {
            if (!result?.success) {
              throw new Error(result?.message || '连接传输失败')
            }
            callback()
          })
          .catch((error) => {
            setErrorMessage(error.message)
            errback(error)
          })
      })

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        appendDebugLog('📤 sendTransport produce', {
          kind,
          rtpParametersKeys: Object.keys(rtpParameters || {}),
          appData,
        })
        produceLiveTrack(sendTransport.id, kind, rtpParameters, appData)
          .then((result) => {
            if (!result?.success) {
              throw new Error(result?.message || '创建 Producer 失败')
            }
            callback({ id: result.producer.producerId })
          })
          .catch((error) => {
            setErrorMessage(error.message)
            errback(error)
          })
      })

      sendTransport.on('connectionstatechange', (state) => {
        appendDebugLog('📡 sendTransport connectionstatechange', {
          state,
        })
        setStatus(`传输状态：${state}`)
      })

      sendTransportRef.current = sendTransport

      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        appendDebugLog('🎥 准备发布视频 track', {
          id: videoTrack.id,
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          readyState: videoTrack.readyState,
        })
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          codecOptions: {
            videoGoogleStartBitrate: 1200,
          },
        })
        producerRefs.current.push(videoProducer)
        videoProducerRef.current = videoProducer

        appendDebugLog('✅ 视频 Producer 已创建', {
          producerId: videoProducer.id,
          kind: videoProducer.kind,
        })

        videoProducer.on('transportclose', () => {
          appendDebugLog('⛔ 视频 Producer transportclose', {
            producerId: videoProducer.id,
          })
        })

        videoProducer.on('close', () => {
          appendDebugLog('⛔ 视频 Producer close', {
            producerId: videoProducer.id,
          })
        })
      }

      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        appendDebugLog('🎙️ 准备发布音频 track', {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
        })
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: true,
          },
        })
        producerRefs.current.push(audioProducer)

        appendDebugLog('✅ 音频 Producer 已创建', {
          producerId: audioProducer.id,
          kind: audioProducer.kind,
        })

        audioProducer.on('transportclose', () => {
          appendDebugLog('⛔ 音频 Producer transportclose', {
            producerId: audioProducer.id,
          })
        })

        audioProducer.on('close', () => {
          appendDebugLog('⛔ 音频 Producer close', {
            producerId: audioProducer.id,
          })
        })
      }

      setStatus('直播进行中')
      setIsLivePublishing(true)
    } catch (error) {
      setErrorMessage(error.message)
      setStatus('启动失败')
      setIsLivePublishing(false)
      await stopPublishing().catch(() => {})
    } finally {
      setIsPublishing(false)
    }
  }

  const handlePublishToggle = async () => {
    if (isPublishing) {
      return
    }

    if (isLivePublishing) {
      await stopPublishing()
      return
    }

    await startPublishing()
  }

  return (
    <div className="live-stream-page">
      <div className="live-stream-page-shell">
        <h1 className="live-stream-page-title">首页直播发布</h1>
        <p className="live-stream-page-desc">使用浏览器原生摄像头/麦克风，通过 mediasoup 将画面发布到后端。</p>

        {errorMessage ? <div className="live-stream-page-field live-stream-page-error"><strong>错误</strong><div>{errorMessage}</div></div> : null}

        <div className="live-stream-page-layout">
          <div className="live-stream-page-video-card">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="live-stream-page-video"
          />
          <div className="live-stream-page-camera-actions">
            <button
              type="button"
              onClick={switchCamera}
              className="live-stream-page-secondary-btn"
              disabled={!mediaStreamRef.current}
            >
              切换前后摄像头
            </button>
            <span className="live-stream-page-camera-hint">当前：{facingMode === 'user' ? '前置' : '后置'}</span>
          </div>
          </div>

          <div className="live-stream-page-panel">
          <div className="live-stream-page-field"><strong>状态</strong><div>{status}</div></div>
          <div className="live-stream-page-field"><strong>会话 ID</strong><div className="live-stream-page-break">{sessionId || '未创建'}</div></div>
          {previewUrl ? (
            <div className="live-stream-page-field">
              <strong>内网预览链接</strong>
              <div className="live-stream-page-break live-stream-page-preview-url">{previewUrl}</div>
              <div className="live-stream-page-actions">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(previewUrl).catch(() => {})}
                  className="live-stream-page-secondary-btn"
                >
                  复制预览链接
                </button>
              </div>
            </div>
          ) : null}

          <div className="live-stream-page-field live-stream-page-debug">
            <div className="live-stream-page-debug-header">
              <strong>调试窗口</strong>
              <button
                type="button"
                onClick={clearDebugLogs}
                className="live-stream-page-secondary-btn"
              >
                清空
              </button>
            </div>
            <div className="live-stream-page-debug-tip">
              这里会显示手机端采集、传输、Producer 创建和 track 出帧状态。
            </div>
            <div className="live-stream-page-debug-list" ref={debugLogTailRef}>
              {debugLogs.length > 0 ? debugLogs.map((entry) => (
                <div key={entry.id} className="live-stream-page-debug-item">
                  <div className="live-stream-page-debug-time">[{entry.timestamp}]</div>
                  <div className="live-stream-page-debug-message">{entry.message}</div>
                  {entry.data ? <pre className="live-stream-page-debug-data">{JSON.stringify(entry.data, null, 2)}</pre> : null}
                </div>
              )) : <div className="live-stream-page-debug-empty">暂无日志，开始发布后会自动显示。</div>}
            </div>
          </div>

          <div className="live-stream-page-actions">
            <button
              type="button"
              onClick={handlePublishToggle}
              disabled={isPublishing}
              className="live-stream-page-primary-btn"
            >
              {isPublishing ? '启动中...' : isLivePublishing ? '结束发布' : '开始发布'}
            </button>
          </div>

          <div className="live-stream-page-tips">
            <div>1. 浏览器采集本地摄像头/麦克风。</div>
            <div>2. 通过 mediasoup 建立 WebRTC send transport。</div>
            <div>3. 后端可继续把 Producer 连接到 ffmpeg 或内网预览。</div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiveStreamPage