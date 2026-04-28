import { useCallback, useEffect, useRef, useState } from 'react'
import { getRefreshMessage, mergeRuntimeSettings } from '../../services/musicPlay'
import { useLanguage } from '../../context/languageContext'

export function useMusicPageData({ musicPageApi, isPlaylistLocked, onPlaylistLockChange, onMessage }) {
  const { t } = useLanguage()
  const initialLoadRef = useRef(false)
  const refreshPromiseRef = useRef(null)
  const messageRef = useRef(onMessage)
  const playlistLockedRef = useRef(isPlaylistLocked)
  const tracksRef = useRef([])
  const temporaryTracksRef = useRef([])
  const [tracks, setTracks] = useState([])
  const [temporaryTracks, setTemporaryTracks] = useState([])
  const [speechInputMode, setSpeechInputMode] = useState('ai')
  const [speechLanguage, setSpeechLanguage] = useState('zh-CN')
  const [offlineFallbackEnabled, setOfflineFallbackEnabled] = useState(true)
  const [aiTextOptimizeEnabled, setAiTextOptimizeEnabled] = useState(true)
  const [showModelHintEnabled, setShowModelHintEnabled] = useState(true)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [hasCurrentShow, setHasCurrentShow] = useState(false)
  const [currentShowName, setCurrentShowName] = useState('Not set')
  const [currentProgramName, setCurrentProgramName] = useState('No track yet')
  const [currentPerformerName, setCurrentPerformerName] = useState('No performer yet')
  const [historyShows, setHistoryShows] = useState([])
  const [backendPlayback, setBackendPlayback] = useState({
    available: false,
    driver: '',
    canPause: false,
    volumePercent: 100,
    state: 'idle',
    errorMessage: '',
    currentTrack: null,
  })
  const playStateRef = useRef(backendPlayback.state)

  useEffect(() => {
    messageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    playlistLockedRef.current = isPlaylistLocked
  }, [isPlaylistLocked])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  useEffect(() => {
    temporaryTracksRef.current = temporaryTracks
  }, [temporaryTracks])

  const updateRefreshMessage = useCallback((nextTracks = tracksRef.current, nextFiles = temporaryTracksRef.current, locked = playlistLockedRef.current) => {
    messageRef.current(getRefreshMessage(Array.isArray(nextTracks) ? nextTracks : [], Array.isArray(nextFiles) ? nextFiles : [], locked))
  }, [])

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
        throw new Error(result.message || t('Load failed', '加载失败'))
      }
      setHistoryShows(Array.isArray(result.shows) ? result.shows : [])
    } catch {
      setHistoryShows([])
    }
  }, [musicPageApi, t])

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
        setHasCurrentShow(false)
        onPlaylistLockChange(false)
        setCurrentShowName(t('Not set', '未设置'))
        setCurrentProgramName(t('No track yet', '暂无节目'))
        setCurrentPerformerName(t('No performer yet', '暂无演出人员'))
        return
      }

      setHasCurrentShow(true)
      onPlaylistLockChange(Boolean(result.currentShow.playlistLocked))
      setCurrentShowName(result.currentShow.recordName || t('Not set', '未设置'))
      if (result.hasCurrentProgram && result.currentProgram) {
        setCurrentProgramName(result.currentProgram.programName || t('No track yet', '暂无节目'))
        setCurrentPerformerName(result.currentProgram.performer || t('No performer yet', '暂无演出人员'))
      } else {
        setCurrentProgramName(t('No track yet', '暂无节目'))
        setCurrentPerformerName(t('No performer yet', '暂无演出人员'))
      }
    } catch {
      setHasCurrentShow(false)
      onPlaylistLockChange(false)
      setCurrentShowName(t('Not set', '未设置'))
      setCurrentProgramName(t('No track yet', '暂无节目'))
      setCurrentPerformerName(t('No performer yet', '暂无演出人员'))
    }
  }, [musicPageApi, onPlaylistLockChange, t])

  const fetchTracks = useCallback(async () => {
    try {
      const result = await musicPageApi.fetchMusicList()
      if (!result.success) {
        throw new Error(result.message || t('Load failed', '加载失败'))
      }

      const audioTracks = (result.musicList || []).map((item) => ({
        id: item.id,
        performer: item.performer,
        programName: item.programName,
        hostScript: item.hostScript || '',
        fileName: item.displayName || item.fileName,
        savedName: item.savedName || '',
        playUrl: item.playUrl || '',
        fileHash: item.fileHash || '',
        status: item.status || 'saved',
        isTemporary: item.status === 'temp' || Boolean(item.isTemporary),
      }))

      const nextSavedTracks = audioTracks.filter((item) => !item.isTemporary)
      const nextTemporaryTracks = audioTracks.filter((item) => item.isTemporary)

      setTracks(nextSavedTracks)
      setTemporaryTracks(nextTemporaryTracks)
      return { tracks: nextSavedTracks, temporaryTracks: nextTemporaryTracks, error: null }
    } catch (error) {
      setTracks([])
      setTemporaryTracks([])
      messageRef.current(t(`Failed to load music list: ${error.message}`, `加载音乐列表失败：${error.message}`))
      return { tracks: [], temporaryTracks: [], error }
    }
  }, [musicPageApi, t])

  const refreshPageData = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current
    }

    refreshPromiseRef.current = (async () => {
      const [trackResult] = await Promise.all([
        fetchTracks(),
        fetchCurrentShow(),
        fetchUserSettings(),
        fetchHistoryShows(),
        fetchBackendPlaybackState(),
      ])

      if (!trackResult?.error) {
        updateRefreshMessage(trackResult.tracks, trackResult.temporaryTracks, playlistLockedRef.current)
      }

      return trackResult
    })()

    try {
      await refreshPromiseRef.current
    } finally {
      refreshPromiseRef.current = null
    }
  }, [fetchBackendPlaybackState, fetchCurrentShow, fetchHistoryShows, fetchTracks, fetchUserSettings, updateRefreshMessage])

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
    temporaryTracks,
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
    marqueeSpeedSec,
    setMarqueeSpeedSec,
    fontScalePercent,
    setFontScalePercent,
    hasCurrentShow,
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
    playStateRef,
  }
}