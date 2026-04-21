import { useEffect, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'

import { apiGet } from '../services/apiClientUtil'
import {
  connectLiveTransport,
  consumeLiveTrack,
  createLiveTransport,
  fetchLiveRtpCapabilities,
  resumeLiveConsumer,
} from '../services/liveStream/liveStreamService'
import { fetchWebRtcSessions } from '../services/home/homePageService'
import { connect as connectWs, sendJsonAsText } from '../services/wsClientService'

function pickLatestSession(sessions) {
  const sortedSessions = [...(Array.isArray(sessions) ? sessions : [])]
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())

  return (
    sortedSessions.find((session) => Number(session?.producerCount || 0) > 0)
    || sortedSessions.find((session) => Number(session?.transportCount || 0) > 0)
    || sortedSessions[0]
    || null
  )
}

function HomeLivePreviewPlayer() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const deviceRef = useRef(null)
  const recvTransportRef = useRef(null)
  const consumerRefs = useRef([])
  const consumedProducerIdsRef = useRef(new Set())
  const monitorSocketRef = useRef(null)

  const [previewSession, setPreviewSession] = useState(null)
  const [previewStatus, setPreviewStatus] = useState('点击大按钮开始预览。')
  const [monitorStatus, setMonitorStatus] = useState('未连接')
  const [errorMessage, setErrorMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [producerSummary, setProducerSummary] = useState([])

  const cleanupPreviewResources = async () => {
    if (monitorSocketRef.current) {
      try {
        monitorSocketRef.current.close()
      } catch {
        // ignore
      }
      monitorSocketRef.current = null
    }

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

    if (videoRef.current) {
      try {
        videoRef.current.pause()
      } catch {
        // ignore
      }
      videoRef.current.srcObject = null
    }

    deviceRef.current = null
    consumedProducerIdsRef.current = new Set()
  }

  const attachStreamToVideo = async () => {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      return
    }

    const nextStream = new MediaStream(streamRef.current.getTracks())
    streamRef.current = nextStream
    video.srcObject = nextStream
    video.onloadedmetadata = () => setPreviewStatus('视频流已加载，点击播放可直接观看。')
    video.onloadeddata = () => setPreviewStatus('视频首帧已加载，正在播放。')
    video.onplaying = () => setPreviewStatus('视频流正在播放。')
    video.onpause = () => setPreviewStatus('视频流已暂停。')
    video.onwaiting = () => setPreviewStatus('视频流正在等待首帧。')
    video.onerror = () => {
      setErrorMessage('视频标签播放失败，请检查浏览器控制台或编码格式。')
      setPreviewStatus('预览失败。')
    }

    try {
      await video.play()
    } catch {
      // A user gesture already happened; keep the stream attached.
    }
  }

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

  const ensureRecvTransport = async (sessionId) => {
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
      setPreviewStatus(`预览状态：${state}`)
    })

    recvTransportRef.current = recvTransport

    if (!streamRef.current) {
      streamRef.current = new MediaStream()
    }

    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current
    }

    return recvTransport
  }

  const consumeKnownProducers = async (sessionId, producers) => {
    if (!Array.isArray(producers) || producers.length === 0) {
      return
    }

    const recvTransport = await ensureRecvTransport(sessionId)

    for (const producer of producers) {
      if (!producer?.producerId || consumedProducerIdsRef.current.has(producer.producerId)) {
        continue
      }

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

      consumer.track.onunmute = () => {
        if (consumer.track.kind === 'video') {
          setPreviewStatus('视频首帧已到达，正在渲染。')
        }

        if (videoRef.current) {
          attachStreamToVideo().catch((error) => {
            setErrorMessage(error.message)
          })
        }
      }

      consumer.track.onmute = () => {
        if (consumer.track.kind === 'video') {
          setPreviewStatus('视频轨道暂时无帧。')
        }
      }

      await resumeLiveConsumer(consumer.id)
      await attachStreamToVideo()
      setPreviewStatus('视频预览已启动。')
    }
  }

  const loadLatestSession = async () => {
    const result = await fetchWebRtcSessions()
    if (!result.success || !Array.isArray(result.sessions) || result.sessions.length === 0) {
      setPreviewSession(null)
      return null
    }

    const latestSession = pickLatestSession(result.sessions)
    setPreviewSession(latestSession)
    return latestSession
  }

  const startPreview = async () => {
    if (isLoading) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      await cleanupPreviewResources()
      const session = await loadLatestSession()

      if (!session) {
        setPreviewStatus('暂无直播会话，请先在直播发布页启动推流。')
        setMonitorStatus('未连接')
        setIsPlaying(false)
        return
      }

      setPreviewSession(session)
      setIsPlaying(true)
      setMonitorStatus('正在连接')
      setPreviewStatus('正在连接预览。')

      const producersResult = await apiGet(`/v1/webrtc/sessions/${session.sessionId}/producers`)
      if (!producersResult?.success) {
        throw new Error(producersResult?.message || '获取 producer 失败')
      }

      const producers = Array.isArray(producersResult.producers) ? producersResult.producers : []
      setProducerSummary(producers)

      if (producers.length === 0) {
        setPreviewStatus('会话已连接，正在等待主播推流。')
        return
      }

      await consumeKnownProducers(session.sessionId, producers)
    } catch (error) {
      setErrorMessage(error.message || '预览启动失败')
      setPreviewStatus('预览启动失败。')
      setMonitorStatus('连接失败')
      setIsPlaying(false)
    } finally {
      setIsLoading(false)
    }
  }

  const stopPreview = async () => {
    await cleanupPreviewResources()
    setIsPlaying(false)
    setMonitorStatus('未连接')
    setPreviewStatus(previewSession ? '预览已停止。' : '点击大按钮开始预览。')
  }

  useEffect(() => {
    loadLatestSession().catch(() => {
      setPreviewSession(null)
    })
  }, [])

  useEffect(() => {
    if (!isPlaying || !previewSession?.sessionId) {
      return undefined
    }

    let stopped = false
    let socket = null

    const connectMonitor = async () => {
      try {
        socket = await connectWs(
          'live-monitor',
          null,
          () => {
            if (!stopped) {
              setMonitorStatus('已连接')
            }
          },
          () => {
            if (!stopped) {
              setMonitorStatus('已断开')
            }
          },
          (message) => {
            if (!message || message.type !== 'live-push-event') {
              return
            }

            const payload = message.data || {}
            if (payload.sessionId && payload.sessionId !== previewSession.sessionId) {
              return
            }

            if (payload.event === 'session-closed') {
              void cleanupPreviewResources()
              setPreviewStatus('会话已关闭。')
              setMonitorStatus('已断开')
              setIsPlaying(false)
              setProducerSummary([])
              return
            }

            if (payload.event === 'producer-created') {
              const nextProducer = {
                producerId: payload.producerId,
                kind: payload.kind,
                transportId: payload.transportId,
                createdAt: payload.createdAt || new Date().toISOString(),
                appData: payload.appData || {},
              }

              setProducerSummary((current) => {
                if (current.some((producer) => producer.producerId === nextProducer.producerId)) {
                  return current
                }

                return [...current, nextProducer]
              })

              consumeKnownProducers(previewSession.sessionId, [nextProducer]).catch((error) => {
                setErrorMessage(error.message || '消费新 Producer 失败')
              })
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

        monitorSocketRef.current = socket
        sendJsonAsText(socket, {
          type: 'identify',
          data: {
            clientType: 'live-monitor',
            sessionId: previewSession.sessionId,
          },
        })
      } catch (error) {
        if (!stopped) {
          setMonitorStatus('连接失败')
          setErrorMessage(error.message || 'WebSocket 连接失败')
        }
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
      if (monitorSocketRef.current === socket) {
        monitorSocketRef.current = null
      }
    }
  }, [isPlaying, previewSession?.sessionId])

  useEffect(() => () => {
    void cleanupPreviewResources()
  }, [])

  return (
    <div className="home-live-preview-card">
      <div className="home-live-preview-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="home-live-preview-video"
        />

        {!isPlaying ? (
          <div className="home-live-preview-overlay">
            <div className="home-live-preview-overlay-glow" />
            <div className="home-live-preview-overlay-content">
              <button
                type="button"
                className="home-live-preview-play-button"
                onClick={startPreview}
                disabled={isLoading}
                aria-label="开始预览"
              >
                <span className="home-live-preview-play-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="home-live-preview-footer">
        <div className="home-live-preview-status-row">
          <span className="home-live-preview-status-text">{previewStatus}</span>
          <span className={`home-live-preview-status-pill home-live-preview-status-pill-${monitorStatus === '已连接' ? 'connected' : monitorStatus === '连接失败' ? 'error' : 'idle'}`}>
            {monitorStatus}
          </span>
        </div>

        {isPlaying ? (
          <button
            type="button"
            onClick={stopPreview}
            className="home-live-preview-secondary-btn"
          >
            停止预览
          </button>
        ) : null}
      </div>

      {errorMessage ? <div className="home-live-preview-error-line">{errorMessage}</div> : null}
    </div>
  )
}

export default HomeLivePreviewPlayer