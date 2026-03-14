import { useCallback } from 'react'
import { getTrackPlaybackState } from '../../services/musicPlay'

export function useMusicPlaybackActions({
  tracks,
  currentTrackId,
  backendPlayback,
  audioCtxRef,
  musicPageApi,
  openFloatingPlayer,
  setCurrentTrackId,
  setCurrentProgramName,
  setCurrentPerformerName,
  setBackendPlayback,
  setMessage,
  refreshPageData,
  reportClientError,
}) {
  const fetchBackendPlaybackState = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchBackendPlaybackState()
      if (!result.success || !result.state) {
        return null
      }

      setBackendPlayback(result.state)
      return result.state
    } catch {
      setBackendPlayback((prev) => ({
        ...prev,
        available: false,
        state: 'idle',
      }))
      return null
    }
  }, [musicPageApi, setBackendPlayback])

  const switchToHistoryShow = useCallback(async (fileName) => {
    try {
      const result = await musicPageApi.switchToHistoryShow(fileName, true)
      if (!result.success) {
        throw new Error(result.message || '切换失败')
      }

      setCurrentTrackId(null)
      await refreshPageData()
      setCurrentProgramName('暂无节目')
      setCurrentPerformerName('暂无演出人员')
      setMessage(`已切换当前演出：${result.currentShow?.recordName || fileName}`)
    } catch (error) {
      setMessage(`切换演出失败：${error.message}`)
    }
  }, [musicPageApi, refreshPageData, setCurrentPerformerName, setCurrentProgramName, setCurrentTrackId, setMessage])

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = AudioContext ? new AudioContext() : null
    }
    return audioCtxRef.current
  }, [audioCtxRef])

  const playProgramEffect = useCallback(async (effectName) => {
    const ctx = getAudioContext()
    if (!ctx) {
      setMessage('当前浏览器不支持音效播放。')
      return
    }

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime
    const lowerName = String(effectName || '').toLowerCase()
    const baseFreq = lowerName.includes('鼓') ? 140 : lowerName.includes('笑') ? 440 : lowerName.includes('拍') ? 320 : 260
    const repeat = lowerName.includes('拍') ? 5 : lowerName.includes('笑') ? 4 : 3

    for (let i = 0; i < repeat; i += 1) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = i % 2 === 0 ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(baseFreq + i * 30, now + i * 0.15)
      gain.gain.setValueAtTime(0.0001, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.15 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.14)
    }
  }, [getAudioContext, setMessage])

  const triggerLocalEffect = useCallback((effectName) => {
    playProgramEffect(effectName)
    setMessage(`已触发节目效果：${effectName}`)
  }, [playProgramEffect, setMessage])

  const onPlay = useCallback(async (trackId) => {
    const selectedTrack = tracks.find((track) => track.id === trackId)
    const savedFileName = String(selectedTrack?.savedName || '').trim()
    const sourceFileName = String(selectedTrack?.fileName || savedFileName || '').trim()
    if (!savedFileName) {
      setMessage('该节目暂无可播放音频，请先上传或绑定音频文件。')
      return
    }

    try {
      try {
        await musicPageApi.updateCurrentProgram({
          performer: selectedTrack.performer,
          programName: selectedTrack.programName,
        })

        setCurrentProgramName(selectedTrack.programName || '暂无节目')
        setCurrentPerformerName(selectedTrack.performer || '暂无演出人员')
      } catch {
        setMessage('更新当前节目状态失败，但不影响本次播放。')
      }

      setCurrentTrackId(trackId)

      const backendResult = await musicPageApi.playBackendTrack({
        fileName: savedFileName,
        trackId: selectedTrack.id,
        performer: selectedTrack.performer,
        programName: selectedTrack.programName,
      })
      if (!backendResult.success || !backendResult.state) {
        throw new Error(backendResult.message || '未能开始播放')
      }

      setBackendPlayback(backendResult.state)
      setMessage('已开始播放。关闭当前页面后，只要服务仍在运行，音乐会继续播放。')
    } catch (error) {
      const errorName = error?.name || 'UnknownError'
      const errorMessage = error?.message || '未知错误'
      console.error('[MusicPage:onPlay] 播放失败', {
        trackId,
        fileName: sourceFileName,
        savedName: savedFileName,
        errorName,
        errorMessage,
        error,
      })

      await reportClientError({
        message: '[MusicPage:onPlay] 播放失败',
        stack: String(error?.stack || ''),
        meta: {
          trackId,
          fileName: sourceFileName,
          savedName: savedFileName,
          errorName,
          errorMessage,
        },
      })

      if (errorName === 'AbortError') return
      setMessage(`播放失败：${errorName} - ${errorMessage}`)
    }
  }, [musicPageApi, reportClientError, setBackendPlayback, setCurrentPerformerName, setCurrentProgramName, setCurrentTrackId, setMessage, tracks])

  const controlBackendPlayback = useCallback(async (action) => {
    try {
      const result = await musicPageApi.controlBackendPlayback(action)
      if (!result.success || !result.state) {
        throw new Error(result.message || '控制失败')
      }

      setBackendPlayback(result.state)

      const label = action === 'pause' ? '播放已暂停' : action === 'resume' ? '播放已恢复' : '播放已停止'
      setMessage(label)
      return result.state
    } catch (error) {
      setMessage(`播放控制失败：${error.message}`)
      return null
    }
  }, [musicPageApi, setBackendPlayback, setMessage])

  const toggleTrackPlayback = useCallback(async (track) => {
    if (!track?.savedName) {
      return
    }

    const playbackState = getTrackPlaybackState(track, currentTrackId, backendPlayback)
    if (playbackState === 'playing') {
      await controlBackendPlayback('pause')
      return
    }

    if (playbackState === 'paused') {
      await controlBackendPlayback('resume')
      return
    }

    if (playbackState === 'stopping') {
      return
    }

    await onPlay(track.id)
  }, [backendPlayback, controlBackendPlayback, currentTrackId, onPlay])

  const openPreviewPlayer = useCallback(async (track) => {
    const savedFileName = String(track?.savedName || '').trim()
    if (!savedFileName) {
      setMessage('该节目暂无可预听音频。')
      return
    }

    try {
      const latestBackendState = (await fetchBackendPlaybackState()) || backendPlayback
      if (String(latestBackendState?.state || '').trim() === 'playing') {
        const currentProgram = String(latestBackendState?.currentTrack?.programName || '').trim()
        openFloatingPlayer({
          url: '',
          performer: latestBackendState?.currentTrack?.performer || track.performer,
          programName: currentProgram || track.programName,
          fileName: latestBackendState?.currentTrack?.fileName || track.fileName,
          savedName: latestBackendState?.currentTrack?.savedName || savedFileName,
          syncOnly: true,
          message: currentProgram ? `当前正在播放《${currentProgram}》，此处显示同步进度。` : '当前正在播放中，此处显示同步进度。',
        })
        setMessage(currentProgram ? `当前正在播放《${currentProgram}》，悬浮窗已切换为进度同步。` : '当前正在播放中，悬浮窗已切换为进度同步。')
        return
      }

      const result = await musicPageApi.fetchPreviewSource(savedFileName)
      if (!result.success || !result.url) {
        throw new Error(result.message || '获取预听音频失败')
      }

      openFloatingPlayer({
        url: result.url,
        performer: track.performer,
        programName: track.programName,
        fileName: result.fileName || track.fileName,
        savedName: result.savedName || savedFileName,
      })
      setMessage('已打开预听工具。')
    } catch (error) {
      setMessage(`打开预听失败：${error.message}`)
    }
  }, [backendPlayback, fetchBackendPlaybackState, musicPageApi, openFloatingPlayer, setMessage])

  return {
    fetchBackendPlaybackState,
    switchToHistoryShow,
    triggerLocalEffect,
    onPlay,
    controlBackendPlayback,
    toggleTrackPlayback,
    openPreviewPlayer,
  }
}