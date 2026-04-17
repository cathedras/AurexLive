import { useEffect, useMemo, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'
import { Link, useSearchParams } from 'react-router-dom'

import {
  connectLiveTransport,
  consumeLiveTrack,
  createLiveTransport,
  fetchLiveRtpCapabilities,
  resumeLiveConsumer,
} from '../services/liveStream/liveStreamService'
import { apiGet } from '../services/apiClientUtil'
import { connect as connectWs, sendJsonAsText } from '../services/wsClientService'

function LivePreviewPage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const deviceRef = useRef(null)
  const recvTransportRef = useRef(null)
  const consumerRefs = useRef([])
  const consumedProducerIdsRef = useRef(new Set())
  const [searchParams] = useSearchParams()
  const sessionId = useMemo(() => String(searchParams.get('sessionId') || '').trim(), [searchParams])
  const [reloadToken, setReloadToken] = useState(0)
  const [status, setStatus] = useState('正在连接')
  const [errorMessage, setErrorMessage] = useState('')
  const [producerSummary, setProducerSummary] = useState([])
  const [monitorStatus, setMonitorStatus] = useState('未连接')
  const [monitorLogs, setMonitorLogs] = useState([])
  const monitorLogSeqRef = useRef(0)

  const handleManualRefresh = () => {
    setReloadToken((value) => value + 1)
    setStatus('正在手动刷新')
  }

  const appendMonitorLog = (message, data = null) => {
    const details = (() => {
      if (data == null) return ''
      if (typeof data === 'string') return data
      try {
        return JSON.stringify(data, null, 2)
      } catch {
        return String(data)
      }
    })()

    monitorLogSeqRef.current += 1
    const nextLog = {
      id: monitorLogSeqRef.current,
      time: new Date().toLocaleTimeString(),
      message,
      details,
    }

    setMonitorLogs((current) => [...current.slice(-19), nextLog])
  }

  const attachStreamToVideo = async () => {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      return
    }

    const nextStream = new MediaStream(streamRef.current.getTracks())
    streamRef.current = nextStream
    video.srcObject = nextStream

    try {
      await video.play()
    } catch(err) {
      // Some browsers require a user gesture; keep the stream attached anyway.
      console.log(err)
    }
  }

  useEffect(() => {
    if (!sessionId) {
      setStatus('缺少 sessionId')
      return undefined
    }

    let stopped = false
    const videoElement = videoRef.current

    const ensureDevice = async () => {
      if (deviceRef.current) {
        return deviceRef.current
      }

      const rtpCapabilitiesResult = await fetchLiveRtpCapabilities()
      if (!rtpCapabilitiesResult?.success) {
        throw new Error(rtpCapabilitiesResult?.message || '获取 RTP 能力失败')
      }

      const device = new Device()
      await device.load({ routerRtpCapabilities: rtpCapabilitiesResult.rtpCapabilities })
      deviceRef.current = device
      return device
    }

    const ensureRecvTransport = async () => {
      const device = await ensureDevice()

      if (recvTransportRef.current) {
        return recvTransportRef.current
      }

      const transportResult = await createLiveTransport(sessionId, 'recv')
      if (!transportResult?.success) {
        throw new Error(transportResult?.message || '创建接收传输失败')
      }

      const transportData = transportResult.transport
      const recvTransport = device.createRecvTransport({
        id: transportData.transportId,
        iceParameters: transportData.iceParameters,
        iceCandidates: transportData.iceCandidates,
        dtlsParameters: transportData.dtlsParameters,
        sctpParameters: transportData.sctpParameters,
      })

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        connectLiveTransport(recvTransport.id, dtlsParameters)
          .then((result) => {
            if (!result?.success) {
              throw new Error(result?.message || '连接接收传输失败')
            }
            callback()
          })
          .catch((error) => {
            setErrorMessage(error.message)
            errback(error)
          })
      })

      recvTransport.on('connectionstatechange', (state) => {
        setStatus(`预览状态：${state}`)
      })

      recvTransportRef.current = recvTransport

      const stream = new MediaStream()
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      return recvTransport
    }

    const consumeKnownProducers = async (producers) => {
      const recvTransport = await ensureRecvTransport()

      for (const producer of producers) {
        if (!producer?.producerId || consumedProducerIdsRef.current.has(producer.producerId)) {
          continue
        }

        try {
          const consumeResult = await consumeLiveTrack(recvTransport.id, producer.producerId, deviceRef.current.rtpCapabilities)
          if (!consumeResult?.success) {
            continue
          }

          const consumer = await recvTransport.consume({
            id: consumeResult.consumer.consumerId,
            producerId: consumeResult.consumer.producerId,
            kind: consumeResult.consumer.kind,
            rtpParameters: consumeResult.consumer.rtpParameters,
          })

          consumerRefs.current.push(consumer)
          consumedProducerIdsRef.current.add(producer.producerId)

          if (!streamRef.current) {
            streamRef.current = new MediaStream()
          }

          streamRef.current.addTrack(consumer.track)

          if (videoRef.current) {
            videoRef.current.srcObject = streamRef.current
          }

          console.log('✅ 订阅成功，已将 track 挂到 video:', {
            producerId: producer.producerId,
            consumerId: consumer.id,
            kind: consumer.track.kind,
          })

          consumer.track.onunmute = () => {
            console.log('✅ 收到 WebRTC 视频/音频帧！', {
              producerId: producer.producerId,
              consumerId: consumer.id,
              kind: consumer.track.kind,
            })
          }

          consumer.track.onmute = () => {
            console.log('❌ 没有收到媒体帧', {
              producerId: producer.producerId,
              consumerId: consumer.id,
              kind: consumer.track.kind,
            })
          }

          await attachStreamToVideo()

          await resumeLiveConsumer(consumer.id)

          if (consumer.track?.kind === 'video') {
            setStatus('视频流已连接，正在缓冲画面')
          }
        } catch (consumerError) {
          setErrorMessage(consumerError.message)
        }
      }
    }

    const loadSessionOnce = async () => {
      setErrorMessage('')

      try {
        const sessionResult = await apiGet(`/v1/webrtc/sessions/${sessionId}`)
        if (!sessionResult?.success) {
          setStatus('等待主播开播')
          return
        }

        const producersResult = await apiGet(`/v1/webrtc/sessions/${sessionId}/producers`)
        if (!producersResult?.success) {
          throw new Error(producersResult?.message || '获取 producer 失败')
        }

        if (stopped) {
          return
        }

        const producers = Array.isArray(producersResult.producers) ? producersResult.producers : []
        setProducerSummary(producers)

        await consumeKnownProducers(producers)

        await attachStreamToVideo()

        setStatus(producers.length > 0 ? '正在预览直播' : '已连接，等待主播出画面')
      } catch (error) {
        if (String(error.message || '').includes('404') || String(error.message || '').includes('会话不存在')) {
          setStatus('等待主播开播')
          return
        }

        setErrorMessage(error.message)
        setStatus('预览失败')
      }
    }

    loadSessionOnce()

    return () => {
      stopped = true

      consumerRefs.current.forEach((consumer) => {
        try {
          consumer.close()
        } catch {
          // ignore
        }
      })
      consumerRefs.current = []

      if (recvTransportRef.current) {
        try {
          recvTransportRef.current.close()
        } catch {
          // ignore
        }
        recvTransportRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      if (videoElement) {
        videoElement.srcObject = null
      }

      deviceRef.current = null
      consumedProducerIdsRef.current = new Set()
    }
  }, [sessionId, reloadToken])

  useEffect(() => {
    if (!sessionId) {
      setMonitorStatus('缺少 sessionId')
      return undefined
    }

    let stopped = false
    let socket = null

    const connectMonitor = async () => {
      try {
        setMonitorStatus('正在连接')
        socket = await connectWs(
          'live-monitor',
          null,
          () => {
            if (stopped) {
              return
            }

            setMonitorStatus('已连接')
            appendMonitorLog('WebSocket 已连接', { clientType: 'live-monitor' })
          },
          () => {
            if (stopped) {
              return
            }

            setMonitorStatus('已断开')
            appendMonitorLog('WebSocket 已断开')
          },
          (message) => {
            if (!message || message.type !== 'live-push-event') {
              return
            }

            const payload = message.data || {}
            if (payload.sessionId && payload.sessionId !== sessionId) {
              return
            }

            appendMonitorLog(`收到推流事件：${payload.event || 'unknown'}`, payload)

            if (payload.event === 'producer-created' || payload.event === 'session-created' || payload.event === 'session-closed') {
              setStatus(`收到推流事件：${payload.event}`)
              setReloadToken((value) => value + 1)
            }
          }
        )

        if (stopped) {
          try {
            socket?.close?.()
          } catch {
            // ignore
          }
          return
        }

        sendJsonAsText(socket, {
          type: 'identify',
          data: {
            clientType: 'live-monitor',
            sessionId,
          },
        })
        appendMonitorLog('已发送 identify', { clientType: 'live-monitor', sessionId })
      } catch (error) {
        if (stopped) {
          return
        }

        setMonitorStatus('连接失败')
        appendMonitorLog('WebSocket 连接失败', error.message || String(error))
      }
    }

    connectMonitor()

    return () => {
      stopped = true

      if (socket?.close) {
        try {
          socket.close()
        } catch {
          // ignore
        }
      }
    }
  }, [sessionId])

  return (
    <div className="live-preview-page">
      <div className="live-preview-page-shell">
        <h1 className="live-preview-page-title">内网直播预览</h1>
        <p className="live-preview-page-desc">使用浏览器原生视频标签播放 WebRTC 转发流，适合工作人员内网观看。</p>

        <div className="live-preview-page-nav">
          <Link to="/page/live-stream">返回直播发布页</Link>
          <button type="button" className="live-stream-page-secondary-btn" onClick={handleManualRefresh}>
            手动刷新
          </button>
        </div>

        <div className="live-preview-page-layout">
          <div className="live-preview-page-video-card">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              controls
              muted
              className="live-preview-page-video"
            />
          </div>

          <div className="live-preview-page-panel">
            <div className="live-preview-page-field"><strong>会话 ID</strong><div className="live-preview-page-break">{sessionId || '未提供'}</div></div>
            <div className="live-preview-page-field"><strong>状态</strong><div>{status}</div></div>
            {errorMessage ? <div className="live-preview-page-field live-preview-page-error"><strong>错误</strong><div>{errorMessage}</div></div> : null}
            <div className="live-preview-page-field"><strong>WebSocket 监控</strong><div>{monitorStatus}</div></div>

            <div className="live-preview-page-producers">
              <strong>当前 Producer</strong>
              <ul className="live-preview-page-list">
                {producerSummary.length > 0 ? producerSummary.map((producer) => (
                  <li key={producer.producerId}>{producer.kind} / {producer.producerId.slice(0, 8)}</li>
                )) : <li>暂无可观看流</li>}
              </ul>
            </div>

            <div className="live-preview-page-monitor">
              <div className="live-preview-page-monitor-header">
                <strong>推流事件日志</strong>
                <span>{monitorLogs.length} 条</span>
              </div>
              <ul className="live-preview-page-monitor-list">
                {monitorLogs.length > 0 ? monitorLogs.map((log) => (
                  <li key={log.id} className="live-preview-page-monitor-item">
                    <div className="live-preview-page-monitor-time">{log.time}</div>
                    <div className="live-preview-page-monitor-message">{log.message}</div>
                    {log.details ? <pre className="live-preview-page-monitor-data">{log.details}</pre> : null}
                  </li>
                )) : <li className="live-preview-page-monitor-empty">等待手机端推流事件</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LivePreviewPage