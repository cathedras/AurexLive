import { useCallback, useRef, useState } from 'react'

import { startLiveMicPlayback, stopLiveMicPlayback, switchOutputDevice } from '../../services/musicPlay'
import wsClientService from '../../services/wsClientService'

export function useRecordingLivePlayback({
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
}) {
  const wsRef = useRef(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [enableVolumeWs, setEnableVolumeWs] = useState(true)
  const [switchingOutputDevice, setSwitchingOutputDevice] = useState(false)
  const [livePlaybackEnabled, setLivePlaybackEnabled] = useState(false)
  const [livePlaybackLoading, setLivePlaybackLoading] = useState(false)

  const resetVolumeDisplay = useCallback(() => {
    volumeTargetRef.current = 0
    volumeDisplayRef.current = 0
    if (volumeValueRef.current) {
      volumeValueRef.current.textContent = t('Current volume: 0%', '当前音量: 0%')
    }
  }, [t, volumeDisplayRef, volumeTargetRef, volumeValueRef])

  const isVolumeSocketOpen = useCallback(() => {
    try {
      return Boolean(wsRef.current && typeof wsRef.current.readyState === 'function' && typeof WebSocket !== 'undefined' && wsRef.current.readyState() === WebSocket.OPEN)
    } catch {
      return false
    }
  }, [])

  const closeVolumeSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.close) {
      try { wsRef.current.close() } catch (error) { }
    }
    wsRef.current = null
    setWsConnected(false)
    resetVolumeDisplay()
  }, [resetVolumeDisplay])

  const connectVolumeSocket = useCallback(async (deviceArg = selectedDevice, onVolume = null) => {
    const socket = await wsClientService.connect(
      'volume',
      deviceArg ? { device: deviceArg } : undefined,
      (data) => {
        let nextVolume = 0
        if (typeof data === 'number') {
          nextVolume = Math.max(0, Math.min(100, Number(data) || 0))
        } else if (data && data.volume !== undefined) {
          nextVolume = Math.max(0, Math.min(100, Number(data.volume) || 0))
        }
        volumeTargetRef.current = nextVolume
        if (typeof onVolume === 'function') {
          onVolume(nextVolume)
        }
      },
      () => {
        setWsConnected(true)
        console.log('[WS] connected')
      },
      () => {
        setWsConnected(false)
        console.log('[WS] disconnected')
      },
      (msg) => {
        console.log('[WS] message:', msg)
      }
    )

    wsRef.current = socket
    return socket
  }, [selectedDevice, volumeTargetRef])

  const subscribeVolumeSocket = useCallback((socket, fileName, deviceArg) => {
    if (!socket || !fileName) {
      return
    }

    wsClientService.sendJsonAsText(socket, {
      type: 'subscribe-volume',
      data: { fileName, device: deviceArg }
    })
  }, [])

  const stopLivePlaybackProcess = useCallback(async () => {
    try {
      await stopLiveMicPlayback()
    } catch (error) {
      console.error('Failed to stop live monitoring:', error)
    }
  }, [])

  const ensureVolumeMonitoringForLivePlayback = useCallback(async (deviceArg = selectedDevice, onVolume = null) => {
    if (!enableVolumeWs) {
      setEnableVolumeWs(true)
    }

    if (!isVolumeSocketOpen()) {
      const socket = await connectVolumeSocket(deviceArg, onVolume)
      subscribeVolumeSocket(socket, 'live-mic-playback', deviceArg || null)
      return socket
    }

    subscribeVolumeSocket(wsRef.current, 'live-mic-playback', deviceArg || null)
    return wsRef.current
  }, [connectVolumeSocket, enableVolumeWs, isVolumeSocketOpen, selectedDevice, subscribeVolumeSocket])

  const startLivePlayback = useCallback(async (inputDevice = selectedDevice, outputDevice = selectedOutputDevice) => {
    if (livePlaybackUnavailable) {
      throw new Error(t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听'))
    }

    setActiveControl('live-playback')
    setLivePlaybackLoading(true)
    clearStatus()

    const shouldEnableWs = !enableVolumeWs

    try {
      const result = await startLiveMicPlayback(inputDevice || null, outputDevice || null)
      if (!result || !result.success) {
        throw new Error((result && result.error) || t('Failed to start live monitoring', '启动实时监听失败'))
      }

      await ensureVolumeMonitoringForLivePlayback(inputDevice)
      setLivePlaybackEnabled(true)
      setLivePlaybackLoading(false)
    } catch (error) {
      try {
        await stopLivePlaybackProcess()
      } catch (stopError) {
        console.error('回滚实时监听失败:', stopError)
      }

      if (shouldEnableWs) {
        setEnableVolumeWs(false)
      }

      throw error
    } finally {
      setActiveControl(null)
    }
  }, [clearStatus, enableVolumeWs, ensureVolumeMonitoringForLivePlayback, livePlaybackUnavailable, selectedDevice, selectedOutputDevice, setActiveControl, t, stopLivePlaybackProcess])

  const stopLivePlayback = useCallback(async () => {
    try {
      setActiveControl('live-playback')
      await stopLivePlaybackProcess()
    } finally {
      closeVolumeSocket()
      setLivePlaybackEnabled(false)
      setLivePlaybackLoading(false)
      setActiveControl(null)
    }
  }, [closeVolumeSocket, setActiveControl, stopLivePlaybackProcess])

  const handleToggleVolumeWs = useCallback(async (event, { currentRecordingFileName, isRecordingValue, selectedDeviceValue, onVolume } = {}) => {
    const nextEnabled = event.target.checked
    setEnableVolumeWs(nextEnabled)

    if (!nextEnabled) {
      closeVolumeSocket()
      return
    }

    if (isRecordingValue && currentRecordingFileName) {
      try {
        const socket = await connectVolumeSocket(selectedDeviceValue, onVolume)
        subscribeVolumeSocket(socket, currentRecordingFileName, selectedDeviceValue || null)
      } catch (error) {
        setEnableVolumeWs(false)
        setStatusMessage('error', t(`Volume WS connection failed: ${error.message}`, `音量 WS 连接失败: ${error.message}`))
      }
    }
  }, [closeVolumeSocket, connectVolumeSocket, subscribeVolumeSocket, t])

  const handleOutputDeviceChange = useCallback(async (event) => {
    const nextDevice = event.target.value
    const previousDevice = selectedOutputDevice
    setSelectedOutputDevice(nextDevice)

    try {
      setSwitchingOutputDevice(true)
      const shouldRestartLivePlayback = livePlaybackEnabled
      if (shouldRestartLivePlayback) {
        await stopLivePlaybackProcess()
      }

      const result = await switchOutputDevice(nextDevice)
      if (!result || !result.success) {
        throw new Error((result && result.message) || t('Failed to switch output device', '切换输出设备失败'))
      }

      if (shouldRestartLivePlayback) {
        await startLivePlayback()
      }
    } catch (error) {
      setSelectedOutputDevice(previousDevice)
      if (livePlaybackEnabled) {
        try {
          await startLivePlayback()
        } catch (restartErr) {
          console.error('Failed to restore live monitoring:', restartErr)
        }
      }
      setStatusMessage('error', t(`Failed to switch output device: ${error.message}`, `切换输出设备失败: ${error.message}`))
    } finally {
      setSwitchingOutputDevice(false)
      setLivePlaybackLoading(false)
    }
  }, [livePlaybackEnabled, selectedOutputDevice, setSelectedOutputDevice, setStatusMessage, startLivePlayback, stopLivePlaybackProcess, t])

  const toggleLivePlaybackHandler = useCallback(async () => {
    if (livePlaybackUnavailable) {
      setStatusMessage('warning', t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听'))
      return
    }

    if (livePlaybackEnabled) {
      await stopLivePlayback()
      return
    }

    if (isRecording || loading || switchingOutputDevice) {
      setStatusMessage('warning', t('Stop recording before enabling live monitoring.', '正在录音时不能开启实时监听，请先停止录音'))
      return
    }

    try {
      await startLivePlayback()
    } catch (error) {
      setLivePlaybackEnabled(false)
      setStatusMessage('error', t(`Failed to start live monitoring: ${error.message}`, `启动实时监听失败: ${error.message}`))
    } finally {
      setLivePlaybackLoading(false)
    }
  }, [isRecording, livePlaybackEnabled, livePlaybackUnavailable, loading, setStatusMessage, startLivePlayback, stopLivePlayback, switchingOutputDevice, t])

  const livePlaybackStatus = switchingOutputDevice
    ? (livePlaybackEnabled ? t('Switching output; restarting live monitoring...', '输出切换中，实时监听重启中...') : t('Switching output device...', '输出设备切换中...'))
    : (livePlaybackUnavailable
      ? t('Live monitoring is not supported on macOS yet.', 'macOS 暂不支持实时监听')
      : (livePlaybackLoading
        ? t('Starting live monitoring...', '实时监听启动中...')
        : (livePlaybackEnabled ? t('Live monitoring is on and linked to the current output device.', '实时监听中，已联动当前输出设备') : t('Live monitoring is off.', '实时监听已关闭'))))

  const livePlaybackStatusTone = switchingOutputDevice || livePlaybackLoading
    ? 'pending'
    : (livePlaybackUnavailable
      ? 'disconnected'
      : (livePlaybackEnabled ? 'connected' : 'disconnected'))

  return {
    wsRef,
    wsConnected,
    enableVolumeWs,
    setEnableVolumeWs,
    switchingOutputDevice,
    setSwitchingOutputDevice,
    livePlaybackEnabled,
    setLivePlaybackEnabled,
    livePlaybackLoading,
    setLivePlaybackLoading,
    isVolumeSocketOpen,
    closeVolumeSocket,
    connectVolumeSocket,
    subscribeVolumeSocket,
    ensureVolumeMonitoringForLivePlayback,
    startLivePlayback,
    stopLivePlayback,
    handleToggleVolumeWs,
    handleOutputDeviceChange,
    toggleLivePlaybackHandler,
    livePlaybackStatus,
    livePlaybackStatusTone,
  }
}
