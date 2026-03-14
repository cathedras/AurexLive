import { useCallback, useEffect, useRef, useState } from 'react'
import { getRefreshMessage, isAudioFileName, mergeRuntimeSettings } from '../../services/musicPlay'

export function useMusicPageData({ musicPageApi, isPlaylistLocked, onMessage }) {
  const initialLoadRef = useRef(false)
  const [tracks, setTracks] = useState([])
  const [uploadedAudioFiles, setUploadedAudioFiles] = useState([])
  const [speechInputMode, setSpeechInputMode] = useState('ai')
  const [speechLanguage, setSpeechLanguage] = useState('zh-CN')
  const [offlineFallbackEnabled, setOfflineFallbackEnabled] = useState(true)
  const [aiTextOptimizeEnabled, setAiTextOptimizeEnabled] = useState(true)
  const [showModelHintEnabled, setShowModelHintEnabled] = useState(true)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [currentShowName, setCurrentShowName] = useState('未设置')
  const [currentProgramName, setCurrentProgramName] = useState('暂无节目')
  const [currentPerformerName, setCurrentPerformerName] = useState('暂无演出人员')
  const [historyShows, setHistoryShows] = useState([])
  const [backendPlayback, setBackendPlayback] = useState({
    available: false,
    driver: '',
    canPause: false,
    state: 'idle',
    errorMessage: '',
    currentTrack: null,
  })

  const updateRefreshMessage = useCallback((nextTracks = tracks, nextFiles = uploadedAudioFiles, locked = isPlaylistLocked) => {
    onMessage(getRefreshMessage(Array.isArray(nextTracks) ? nextTracks : [], Array.isArray(nextFiles) ? nextFiles : [], locked))
  }, [isPlaylistLocked, onMessage, tracks, uploadedAudioFiles])

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
  }, [musicPageApi])

  const fetchHistoryShows = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchHistoryShows()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }
      setHistoryShows(Array.isArray(result.shows) ? result.shows : [])
    } catch {
      setHistoryShows([])
    }
  }, [musicPageApi])

  const fetchUserSettings = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchUserSettings()
      if (!result.success || !result.settings) {
        return
      }

      const settings = mergeRuntimeSettings(result.settings)
      setSpeechInputMode(settings.speech.mode)
      setSpeechLanguage(settings.speech.language)
      setOfflineFallbackEnabled(Boolean(settings.speech.offlineFallback))
      setAiTextOptimizeEnabled(Boolean(settings.ai.enabled))
      setShowModelHintEnabled(Boolean(settings.ai.showModelHint))
      setAutoPlayEnabled(Boolean(settings.preferences.autoPlay))
      setMarqueeSpeedSec(Math.max(6, Math.min(40, Number(settings.preferences.marqueeSpeed || 16))))
      setFontScalePercent(Math.max(80, Math.min(140, Number(settings.preferences.fontScale || 100))))
    } catch {
      // keep default runtime values when settings request fails
    }
  }, [musicPageApi])

  const fetchCurrentShow = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchCurrentShowState()

      if (!result.success || !result.hasCurrentShow || !result.currentShow) {
        setCurrentShowName('未设置')
        setCurrentProgramName('暂无节目')
        setCurrentPerformerName('暂无演出人员')
        return
      }

      setCurrentShowName(result.currentShow.recordName || '未设置')
      if (result.hasCurrentProgram && result.currentProgram) {
        setCurrentProgramName(result.currentProgram.programName || '暂无节目')
        setCurrentPerformerName(result.currentProgram.performer || '暂无演出人员')
      } else {
        setCurrentProgramName('暂无节目')
        setCurrentPerformerName('暂无演出人员')
      }
    } catch {
      setCurrentShowName('未设置')
      setCurrentProgramName('暂无节目')
      setCurrentPerformerName('暂无演出人员')
    }
  }, [musicPageApi])

  const fetchTracks = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchMusicList()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }

      const audioTracks = (result.musicList || []).map((item) => ({
        id: item.id,
        performer: item.performer,
        programName: item.programName,
        hostScript: item.hostScript || '',
        fileName: item.displayName || item.fileName,
        savedName: item.savedName || '',
        playUrl: item.playUrl || '',
      }))

      setTracks(audioTracks)
      return { tracks: audioTracks, error: null }
    } catch (error) {
      setTracks([])
      onMessage(`加载音乐列表失败：${error.message}`)
      return { tracks: [], error }
    }
  }, [musicPageApi, onMessage])

  const fetchUploadedAudioFiles = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchUploadedFiles()
      if (!result.success) {
        throw new Error(result.message || '加载失败')
      }

      const nextFiles = Array.isArray(result.files)
        ? result.files.filter((file) => isAudioFileName(file.savedName || file.displayName || ''))
        : []

      setUploadedAudioFiles(nextFiles)
      return { files: nextFiles, error: null }
    } catch (error) {
      setUploadedAudioFiles([])
      onMessage(`加载上传文件失败：${error.message}`)
      return { files: [], error }
    }
  }, [musicPageApi, onMessage])

  const refreshPageData = useCallback(async () => {
    const [trackResult, uploadResult] = await Promise.all([
      fetchTracks(),
      fetchUploadedAudioFiles(),
      fetchCurrentShow(),
      fetchUserSettings(),
      fetchHistoryShows(),
      fetchBackendPlaybackState(),
    ])

    if (!trackResult?.error && !uploadResult?.error) {
      updateRefreshMessage(trackResult.tracks, uploadResult.files, isPlaylistLocked)
    }
  }, [fetchBackendPlaybackState, fetchCurrentShow, fetchHistoryShows, fetchTracks, fetchUploadedAudioFiles, fetchUserSettings, isPlaylistLocked, updateRefreshMessage])

  useEffect(() => {
    if (initialLoadRef.current) {
      return
    }

    initialLoadRef.current = true
    refreshPageData()
  }, [refreshPageData])

  return {
    tracks,
    setTracks,
    uploadedAudioFiles,
    speechInputMode,
    setSpeechInputMode,
    speechLanguage,
    setSpeechLanguage,
    offlineFallbackEnabled,
    setOfflineFallbackEnabled,
    aiTextOptimizeEnabled,
    setAiTextOptimizeEnabled,
    showModelHintEnabled,
    setShowModelHintEnabled,
    autoPlayEnabled,
    marqueeSpeedSec,
    setMarqueeSpeedSec,
    fontScalePercent,
    setFontScalePercent,
    currentShowName,
    setCurrentShowName,
    currentProgramName,
    setCurrentProgramName,
    currentPerformerName,
    setCurrentPerformerName,
    historyShows,
    backendPlayback,
    setBackendPlayback,
    refreshPageData,
    fetchBackendPlaybackState,
    fetchCurrentShow,
    updateRefreshMessage,
  }
}