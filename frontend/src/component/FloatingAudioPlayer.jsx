import { useEffect, useRef, useState } from 'react'

import { useLanguage } from '../context/languageContext'
import { FloatingAudioPlayerContext } from './FloatingAudioPlayerContext'

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
  const { t } = useLanguage()

  if (!playerState.visible) {
    return null
  }

  const syncedSavedName = String(backendPlayback.currentTrack?.savedName || '').trim()
  const playerSavedName = String(playerState.savedName || '').trim()
  const isSyncedWithPlayback = Boolean(playerSavedName) && playerSavedName === syncedSavedName && backendPlayback.progress?.isAvailable
  const progressSourceLabel = isSyncedWithPlayback ? t('Synced progress', '同步进度') : t('Preview progress', '预听进度')
  const currentProgress = isSyncedWithPlayback
    ? backendPlayback.progress
    : localProgress

  const progressPercent = Math.max(0, Math.min(100, Number(currentProgress?.progressPercent || 0)))
  const positionLabel = formatProgressTime(currentProgress?.positionSec)
  const durationLabel = currentProgress?.durationSec == null ? '--:--' : formatProgressTime(currentProgress.durationSec)
  const isBackendSyncOnly = Boolean(playerState.syncOnly) && String(backendPlayback.state || '').trim() === 'playing'
  const shouldShowBackendProgress = isBackendSyncOnly || isSyncedWithPlayback
  const displayTitle = isBackendSyncOnly
    ? backendPlayback.currentTrack?.programName || playerState.programName || playerState.fileName || t('Untitled audio', '未命名音频')
    : playerState.programName || playerState.fileName || t('Untitled audio', '未命名音频')
  const displaySubtitle = isBackendSyncOnly
    ? backendPlayback.currentTrack?.performer || playerState.performer || t('Now playing', '当前播放')
    : playerState.performer || t('Previewing', '当前预听')

  // Helper to check if file is a video based on extension
  const isVideoFile = (fileName) => {
    if (!fileName) return false;
    // Treat .webm as audio (some webm files contain only audio);
    // keep common video-only extensions here
    const videoExtensions = ['.mp4', '.ogg', '.mov', '.avi', '.mkv'];
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return videoExtensions.includes(ext);
  };

  const currentFileName = playerState.fileName || playerState.savedName || '';
  const isVideo = isVideoFile(currentFileName);

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
          <button type="button" className="floating-audio-player-btn" onClick={onToggleCollapsed}>{playerState.collapsed ? t('Expand', '展开') : t('Collapse', '折叠')}</button>
          <button type="button" className="floating-audio-player-btn" onClick={onClose}>{t('Close', '关闭')}</button>
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
            isVideo ? (
              <video
                ref={audioRef}
                className="floating-audio-player-video"
                controls
                style={{ width: '100%', maxHeight: '240px', background: '#000', borderRadius: '4px' }}
                onPlay={onAudioPlay}
                onPause={onAudioPause}
                onEnded={onAudioEnded}
                onError={onAudioError}
                onTimeUpdate={onAudioTimeUpdate}
                onLoadedMetadata={onAudioLoadedMetadata}
              >
                {t('Your browser does not support the video element.', '您的浏览器不支持视频标签。')}
              </video>
            ) : (
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
            )
          )}
          {playerState.message && <div className="floating-audio-player-message">{playerState.message}</div>}
        </>
      )}
    </div>
  )
}

export function FloatingAudioPlayerProvider({ children }) {
  const { t } = useLanguage()
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
        message: t('Preview player opened. Click play to continue.', '已打开预听工具，请点击播放按钮继续。'),
      }))
    })
  }, [playerState.visible, playerState.syncOnly, playerState.url, playerState.playbackRequestId, t])

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
        onAudioEnded={() => setPlayerState((prev) => ({ ...prev, message: t('Preview finished.', '预听结束。') }))}
        onAudioError={() => setPlayerState((prev) => ({ ...prev, message: t('This audio cannot be played right now. Please try again later.', '当前音频无法播放，请稍后重试。') }))}
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

