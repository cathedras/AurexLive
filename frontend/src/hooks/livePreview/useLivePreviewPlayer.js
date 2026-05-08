import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'

import {
  connectLiveTransport,
  consumeLiveTrack,
  createLiveTransport,
  fetchLiveRtpCapabilities,
  fetchLiveSession,
  fetchLiveSessionProducers,
  resumeLiveConsumer,
} from '../../services/liveStream/liveStreamService'
import { connect as connectWs, sendJsonAsText } from '../../services/wsClientService'
import { useLivePreviewSession } from './useLivePreviewSession'

export function useLivePreviewPlayer({ sessionId = '', autoStart = false } = {}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const deviceRef = useRef(null)
  const recvTransportRef = useRef(null)
  const consumerRefs = useRef([])
  const consumedProducerIdsRef = useRef(new Set())
  const monitorSocketRef = useRef(null)
  const manualStartRef = useRef(false)
  const [status, setStatus] = useState('点击开始预览')
  const [errorMessage, setErrorMessage] = useState('')
  const [monitorStatus, setMonitorStatus] = useState('未连接')
  const [producerSummary, setProducerSummary] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoDebug, setVideoDebug] = useState({
    label: '未初始化',
    readyState: 0,
    networkState: 0,
    paused: true,
    currentTime: 0,
    videoWidth: 0,
    videoHeight: 0,
    srcObjectTracks: [],
  })

  const { latestSession, loadLatestSession, isLoading: isLatestSessionLoading } = useLivePreviewSession({ autoLoad: !sessionId })
  const resolvedSessionId = sessionId || latestSession?.sessionId || ''

  const appendDebugLog = useCallback((message, data) => {
    if (data == null) {
      console.log(message)
      return
    }

    console.log(message, data)
  }, [])

  const captureVideoDebug = useCallback((label) => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const nextVideoDebug = {
      label,
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : 0,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      srcObjectTracks: video.srcObject?.getTracks?.().map((track) => ({
        kind: track.kind,
        id: track.id,
        readyState: track.readyState,
        muted: track.muted,
        enabled: track.enabled,
      })) || [],
    }

    setVideoDebug(nextVideoDebug)
    appendDebugLog('🎬 preview video debug', nextVideoDebug)
  }, [appendDebugLog])

  const attachStreamToVideo = useCallback(async () => {
    const video = videoRef.current
    if (!video || !streamRef.current) {
      return
    }

    const nextStream = new MediaStream(streamRef.current.getTracks())
    streamRef.current = nextStream
    video.srcObject = nextStream

    video.onloadedmetadata = () => {
      captureVideoDebug('loadedmetadata')
      setStatus('视频流已加载，等待播放')
    }
    video.onloadeddata = () => {
      captureVideoDebug('loadeddata')
      setStatus('视频首帧已加载，正在播放')
    }
    video.onplaying = () => {
      captureVideoDebug('playing')
      setStatus('视频流正在播放')
    }
    video.onpause = () => {
      captureVideoDebug('pause')
      setStatus('视频流已暂停')
    }
    video.onwaiting = () => {
      captureVideoDebug('waiting')
      setStatus('视频流正在等待首帧')
    }
    video.onerror = () => {
      captureVideoDebug('error')
      setErrorMessage('视频标签播放失败，请检查浏览器控制台或编码格式')
      setStatus('预览失败')
    }

    try {
      await video.play()
      captureVideoDebug('play-promise-resolved')
    } catch (error) {
      appendDebugLog('📺 video play failed', { message: error.message })
      captureVideoDebug('play-promise-rejected')
    }
  }, [appendDebugLog, captureVideoDebug])

  const ensureDevice = useCallback(async () => {
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
  }, [])

  const ensureRecvTransport = useCallback(async () => {
    const device = await ensureDevice()

    if (recvTransportRef.current) {
      return recvTransportRef.current
    }

    const transportResult = await createLiveTransport(resolvedSessionId, 'recv')
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

    if (!streamRef.current) {
      streamRef.current = new MediaStream()
    }

    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current
    }

    return recvTransport
  }, [ensureDevice, resolvedSessionId])

  const consumeKnownProducers = useCallback(async (producers) => {
    const recvTransport = await ensureRecvTransport()
    let consumedAny = false

    for (const producer of producers) {
      if (!producer?.producerId || consumedProducerIdsRef.current.has(producer.producerId)) {
        continue
      }

      const consumeResult = await consumeLiveTrack(recvTransport.id, producer.producerId, deviceRef.current.rtpCapabilities)
      if (!consumeResult?.success) {
        appendDebugLog('❌ consume failed', { producerId: producer.producerId, response: consumeResult })
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

      consumer.track.onunmute = () => {
        captureVideoDebug(`track-unmute:${consumer.track.kind}`)
        if (consumer.track?.kind === 'video') {
          setStatus('视频首帧已到达，正在渲染')
        }
        if (videoRef.current) {
          attachStreamToVideo().catch((error) => setErrorMessage(error.message))
        }
      }

      consumer.track.onmute = () => {
        captureVideoDebug(`track-mute:${consumer.track.kind}`)
        if (consumer.track?.kind === 'video') {
          setStatus('视频轨道暂时无帧')
        }
      }

      await resumeLiveConsumer(consumer.id)
      consumedAny = true
      await attachStreamToVideo()

      if (consumer.track?.kind === 'video') {
        setStatus('视频流已连接，正在等待首帧')
      }

      captureVideoDebug(`consumer-added:${consumer.track.kind}`)
    }

    return consumedAny
  }, [appendDebugLog, attachStreamToVideo, captureVideoDebug, ensureRecvTransport])

  const stopPreview = useCallback(async () => {
    try {
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
      consumedProducerIdsRef.current = new Set()

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
        videoRef.current.srcObject = null
      }

      setIsPlaying(false)
      setMonitorStatus('未连接')
      setStatus('预览已停止')
    } catch (error) {
      setErrorMessage(error.message)
    }
  }, [])

  const loadAndConsumePreview = useCallback(async () => {
    if (isLoading) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setStatus('正在连接')

    try {
      const nextSessionId = resolvedSessionId || (await loadLatestSession())?.sessionId || ''
      if (!nextSessionId) {
        setStatus('暂无直播会话，请先在直播发布页启动推流。')
        setMonitorStatus('未连接')
        setIsPlaying(false)
        return
      }

      const sessionResult = await fetchLiveSession(nextSessionId)
      if (!sessionResult?.success) {
        throw new Error(sessionResult?.message || '会话不存在或暂未就绪')
      }

      const producersResult = await fetchLiveSessionProducers(nextSessionId)
      if (!producersResult?.success) {
        throw new Error(producersResult?.message || '获取 producer 失败')
      }

      setMonitorStatus('已连接')
      setIsPlaying(true)
      setStatus(producersResult.producers?.length > 0 ? '正在预览直播' : '已连接，等待主播出画面')
      setProducerSummary(Array.isArray(producersResult.producers) ? producersResult.producers : [])

      if (!monitorSocketRef.current) {
        const socket = await connectWs(
          'live-monitor',
          { sessionId: nextSessionId },
          undefined,
          () => {
            setMonitorStatus('已连接')
          },
          () => {
            setMonitorStatus('已断开')
          },
          (message) => {
            if (!message || message.type !== 'live-push-event') {
              return
            }

            const payload = message.data || {}
            if (payload.sessionId && payload.sessionId !== nextSessionId) {
              return
            }

            if (payload.event === 'session-closed') {
              setStatus('等待主播开播')
              setProducerSummary([])
              consumedProducerIdsRef.current = new Set()
              return
            }

            if (payload.event === 'producer-created') {
              setProducerSummary((current) => {
                if (current.some((producer) => producer.producerId === payload.producerId)) {
                  return current
                }

                return [
                  ...current,
                  {
                    producerId: payload.producerId,
                    kind: payload.kind,
                    transportId: payload.transportId,
                    createdAt: payload.createdAt || new Date().toISOString(),
                    appData: payload.appData || {},
                  },
                ]
              })
            }
          }
        )

        monitorSocketRef.current = socket
        sendJsonAsText(socket, {
          type: 'identify',
          data: {
            clientType: 'live-monitor',
            sessionId: nextSessionId,
          },
        })
      }

      await consumeKnownProducers(Array.isArray(producersResult.producers) ? producersResult.producers : [])
      await attachStreamToVideo()
    } catch (error) {
      setErrorMessage(error.message)
      setStatus('预览失败')
      setMonitorStatus('连接失败')
      setIsPlaying(false)
    } finally {
      setIsLoading(false)
    }
  }, [attachStreamToVideo, consumeKnownProducers, isLoading, loadLatestSession, resolvedSessionId])

  useEffect(() => {
    if (!autoStart) {
      return undefined
    }

    if (!resolvedSessionId) {
      return undefined
    }

    void loadAndConsumePreview()
    return undefined
  }, [autoStart, loadAndConsumePreview, resolvedSessionId])

  useEffect(() => {
    if (!producerSummary.length || !isPlaying) {
      return undefined
    }

    let cancelled = false

    const syncProducers = async () => {
      try {
        const pending = producerSummary.filter((producer) => producer?.producerId && !consumedProducerIdsRef.current.has(producer.producerId))
        if (!pending.length) {
          return
        }

        await consumeKnownProducers(pending)
        if (!cancelled) {
          await attachStreamToVideo()
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message)
          setStatus('预览失败')
        }
      }
    }

    void syncProducers()

    return () => {
      cancelled = true
    }
  }, [attachStreamToVideo, consumeKnownProducers, isPlaying, producerSummary])

  useEffect(() => {
    return () => {
      void stopPreview()
    }
  }, [stopPreview])

  return {
    videoRef,
    status,
    errorMessage,
    monitorStatus,
    producerSummary,
    videoDebug,
    isLoading,
    isPlaying,
    latestSession,
    resolvedSessionId,
    isLatestSessionLoading,
    startPreview: loadAndConsumePreview,
    stopPreview,
    setProducerSummary,
  }
}
