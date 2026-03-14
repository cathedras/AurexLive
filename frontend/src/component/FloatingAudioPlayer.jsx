import { createContext, useContext, useEffect, useRef, useState } from 'react'

const FloatingAudioPlayerContext = createContext(null)

function formatProgressTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds || 0)))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function FloatingAudioPlayerPanel({ playerState, backendPlayback, localProgress, audioRef, onClose, onToggleCollapsed, onAudioPlay, onAudioPause, onAudioEnded, onAudioError, onAudioTimeUpdate, onAudioLoadedMetadata }) {
  if (!playerState.visible) {
    return null
  }

  const syncedSavedName = String(backendPlayback.currentTrack?.savedName || '').trim()
  const playerSavedName = String(playerState.savedName || '').trim()
  const isSyncedWithPlayback = Boolean(playerSavedName) && playerSavedName === syncedSavedName && backendPlayback.progress?.isAvailable
  const progressSourceLabel = isSyncedWithPlayback ? '同步进度' : '预听进度'
  const currentProgress = isSyncedWithPlayback
    ? backendPlayback.progress
    : localProgress

  const progressPercent = Math.max(0, Math.min(100, Number(currentProgress?.progressPercent || 0)))
  const positionLabel = formatProgressTime(currentProgress?.positionSec)
  const durationLabel = currentProgress?.durationSec == null ? '--:--' : formatProgressTime(currentProgress.durationSec)
  const isBackendSyncOnly = Boolean(playerState.syncOnly) && String(backendPlayback.state || '').trim() === 'playing'
  const shouldShowBackendProgress = isBackendSyncOnly || isSyncedWithPlayback
  const displayTitle = isBackendSyncOnly
    ? backendPlayback.currentTrack?.programName || playerState.programName || playerState.fileName || '未命名音频'
    : playerState.programName || playerState.fileName || '未命名音频'
  const displaySubtitle = isBackendSyncOnly
    ? backendPlayback.currentTrack?.performer || playerState.performer || '当前播放'
    : playerState.performer || '当前预听'

  return (
    <div className={`floating-audio-player ${playerState.collapsed ? 'floating-audio-player-collapsed' : ''}`}>
      <div className="floating-audio-player-header">
        <div className="floating-audio-player-meta">
          <div className="floating-audio-player-title">{displayTitle}</div>
          <div className="floating-audio-player-subtitle">
            {displaySubtitle}
            <span className="floating-audio-player-source">{progressSourceLabel}</span>
          </div>
        </div>
        <div className="floating-audio-player-actions">
          <button type="button" className="floating-audio-player-btn" onClick={onToggleCollapsed}>
            {playerState.collapsed ? '展开' : '收起'}
          </button>
          <button type="button" className="floating-audio-player-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
      {!playerState.collapsed && (
        <>
          {shouldShowBackendProgress && (
            <div className="floating-audio-player-progress">
              <div className="floating-audio-player-progress-time">
                <span>{positionLabel}</span>
                <span>{durationLabel}</span>
              </div>
              <div className="floating-audio-player-progress-track">
                <div className="floating-audio-player-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          {!isBackendSyncOnly && (
            <audio
              ref={audioRef}
              className="floating-audio-player-audio"
              controls
              onPlay={onAudioPlay}
              onPause={onAudioPause}
              onEnded={onAudioEnded}
              onError={onAudioError}
              onTimeUpdate={onAudioTimeUpdate}
              onLoadedMetadata={onAudioLoadedMetadata}
            />
          )}
          {playerState.message && <div className="floating-audio-player-message">{playerState.message}</div>}
        </>
      )}
    </div>
  )
}

export function FloatingAudioPlayerProvider({ children }) {
  const audioRef = useRef(null)
  const [playerState, setPlayerState] = useState({
    visible: false,
    collapsed: false,
    url: '',
    performer: '',
    programName: '',
    fileName: '',
    savedName: '',
    syncOnly: false,
    message: '',
    playbackRequestId: 0,
  })
  const [backendPlayback, setBackendPlayback] = useState({
    state: 'idle',
    currentTrack: null,
    progress: {
      isAvailable: false,
      positionSec: 0,
      durationSec: null,
      progressPercent: 0,
    },
  })
  const [localProgress, setLocalProgress] = useState({
    positionSec: 0,
    durationSec: null,
    progressPercent: 0,
  })

  useEffect(() => {
    if (!playerState.visible || playerState.syncOnly || !playerState.url || !audioRef.current) {
      return
    }

    const audioElement = audioRef.current
    const currentSrc = audioElement.currentSrc || audioElement.src || ''
    const targetUrl = new URL(playerState.url, window.location.origin).toString()

    if (currentSrc !== targetUrl) {
      audioElement.src = playerState.url
      audioElement.load()
    }

    audioElement.play().catch(() => {
      setPlayerState((prev) => ({
        ...prev,
        message: '已打开预听工具，请点击播放按钮继续。',
      }))
    })
  }, [playerState.visible, playerState.url, playerState.playbackRequestId])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return undefined
    }

    if (!playerState.visible) {
      return undefined
    }

    const eventSource = new window.EventSource('/v1/music/backend-progress/stream')

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'))
        if (!payload?.success || !payload?.state) {
          return
        }

        setBackendPlayback(payload.state)
      } catch {
        // ignore malformed SSE payload
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [playerState.visible])

  const openFloatingPlayer = ({ url, performer = '', programName = '', fileName = '', savedName = '', syncOnly = false, message = '' }) => {
    if (audioRef.current && syncOnly) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }

    setLocalProgress({
      positionSec: 0,
      durationSec: null,
      progressPercent: 0,
    })

    setPlayerState((prev) => ({
      ...prev,
      visible: true,
      collapsed: false,
      url,
      performer,
      programName,
      fileName,
      savedName,
      syncOnly,
      message,
      playbackRequestId: prev.playbackRequestId + 1,
    }))
  }

  const closeFloatingPlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }

    setPlayerState((prev) => ({
      ...prev,
      visible: false,
      url: '',
      syncOnly: false,
      message: '',
    }))
  }

  const toggleCollapsed = () => {
    setPlayerState((prev) => ({
      ...prev,
      collapsed: !prev.collapsed,
    }))
  }

  return (
    <FloatingAudioPlayerContext.Provider value={{ openFloatingPlayer, closeFloatingPlayer, playerState }}>
      {children}
      <FloatingAudioPlayerPanel
        playerState={playerState}
        backendPlayback={backendPlayback}
        localProgress={localProgress}
        audioRef={audioRef}
        onClose={closeFloatingPlayer}
        onToggleCollapsed={toggleCollapsed}
        onAudioPlay={() => setPlayerState((prev) => ({ ...prev, message: '' }))}
        onAudioPause={() => setPlayerState((prev) => ({ ...prev, message: prev.message }))}
        onAudioEnded={() => setPlayerState((prev) => ({ ...prev, message: '预听结束。' }))}
        onAudioError={() => setPlayerState((prev) => ({ ...prev, message: '当前音频无法播放，请稍后重试。' }))}
        onAudioTimeUpdate={(event) => {
          const audioElement = event.currentTarget
          const durationSec = Number.isFinite(audioElement.duration) ? audioElement.duration : null
          const positionSec = Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0
          const progressPercent = durationSec && durationSec > 0 ? (positionSec / durationSec) * 100 : 0

          setLocalProgress({
            positionSec,
            durationSec,
            progressPercent,
          })
        }}
        onAudioLoadedMetadata={(event) => {
          const audioElement = event.currentTarget
          const durationSec = Number.isFinite(audioElement.duration) ? audioElement.duration : null

          setLocalProgress((prev) => ({
            ...prev,
            durationSec,
            progressPercent: durationSec && durationSec > 0 ? (prev.positionSec / durationSec) * 100 : 0,
          }))
        }}
      />
    </FloatingAudioPlayerContext.Provider>
  )
}

export function useFloatingAudioPlayer() {
  const context = useContext(FloatingAudioPlayerContext)
  if (!context) {
    throw new Error('useFloatingAudioPlayer 必须在 FloatingAudioPlayerProvider 内使用')
  }

  return context
}