import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useLanguage } from '../context/languageContext'
import {
  controlBackendPlayback,
  fetchBackendPlaybackState,
  updateBackendVolume,
} from '../services/mobile/mobileControlService'
import { createBackendProgressStream } from '../services/stream/streamService'

import './MobileControlPage.css'

const defaultBackendState = {
  available: false,
  driver: '',
  canPause: false,
  volumePercent: 100,
  state: 'idle',
  errorMessage: '',
  currentTrack: null,
  progress: {
    isAvailable: false,
    positionSec: 0,
    durationSec: null,
    progressPercent: 0,
    startedAt: null,
    pausedAt: null,
    updatedAt: null,
  },
  updatedAt: null,
}

function clampVolume(value) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--'
  }

  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function getStatusMeta(backendState, t) {
  if (!backendState.available) {
    return {
      tone: 'danger',
      text: t('Backend unavailable', '后端未就绪'),
    }
  }

  const playbackState = String(backendState.state || 'idle').trim()

  if (playbackState === 'playing') {
    return {
      tone: 'good',
      text: t('Playing', '播放中'),
    }
  }

  if (playbackState === 'paused') {
    return {
      tone: 'warn',
      text: t('Paused', '已暂停'),
    }
  }

  if (playbackState === 'stopping') {
    return {
      tone: 'warn',
      text: t('Stopping', '停止中'),
    }
  }

  if (playbackState === 'stopped') {
    return {
      tone: 'warn',
      text: t('Stopped', '已停止'),
    }
  }

  return {
    tone: 'warn',
    text: playbackState || t('Idle', '待机中'),
  }
}

function MobileControlPage() {
  const { t } = useLanguage()
  const [backendState, setBackendState] = useState(defaultBackendState)
  const [syncMode, setSyncMode] = useState('loading')
  const [message, setMessage] = useState({
    text: t('Loading backend playback state...', '正在加载后端播放状态...'),
    tone: 'warn',
  })
  const [volumeDraft, setVolumeDraft] = useState(100)
  const [isActionPending, setIsActionPending] = useState(false)
  const [isVolumePending, setIsVolumePending] = useState(false)
  const streamRef = useRef(null)
  const pollRef = useRef(null)
  const volumeTimerRef = useRef(null)
  const pendingVolumeRef = useRef(100)

  const applyBackendState = useCallback((nextState) => {
    const normalized = {
      ...defaultBackendState,
      ...(nextState || {}),
      progress: {
        ...defaultBackendState.progress,
        ...(nextState?.progress || {}),
      },
    }

    const nextVolume = clampVolume(normalized.volumePercent)
    setBackendState(normalized)
    setVolumeDraft(nextVolume)
    pendingVolumeRef.current = nextVolume

    if (!normalized.available) {
      setMessage({
        text: normalized.errorMessage || t('The backend player is not available. Please check mpv on the desktop side.', '后端播放器不可用，请回到电脑端检查 mpv 状态。'),
        tone: 'danger',
      })
      return
    }

    if (normalized.errorMessage) {
      setMessage({ text: normalized.errorMessage, tone: 'danger' })
      return
    }

    const playbackState = String(normalized.state || 'idle').trim()
    if (playbackState === 'playing') {
      setMessage({
        text: t('The player is running. You can pause, stop, or change volume.', '播放器正在运行，可暂停、停止或调整音量。'),
        tone: 'good',
      })
      return
    }

    if (playbackState === 'paused') {
      setMessage({
        text: t('The player is paused. You can resume or stop it.', '播放器已暂停，可继续播放或停止。'),
        tone: 'warn',
      })
      return
    }

    if (playbackState === 'stopping') {
      setMessage({
        text: t('The player is switching state. Please wait a moment.', '播放器正在切换状态，请稍候。'),
        tone: 'warn',
      })
      return
    }

    if (playbackState === 'stopped') {
      setMessage({
        text: t('The current track has stopped. Start a new track from the music page.', '当前曲目已停止，请在音乐页重新开始播放。'),
        tone: 'warn',
      })
      return
    }

    setMessage({
      text: t('The backend player is idle. Start playback from the music page.', '后端播放器处于待机状态，请在音乐页启动播放。'),
      tone: '',
    })
  }, [t])

  const refreshBackendState = useCallback(async ({ silent = false } = {}) => {
    try {
      const result = await fetchBackendPlaybackState()
      if (!result?.state) {
        throw new Error(t('Failed to read backend playback state', '读取后端播放状态失败'))
      }

      applyBackendState(result.state)
      if (!silent && result.state.available && !result.state.errorMessage) {
        setMessage({
          text: t('Status updated.', '状态已更新。'),
          tone: 'good',
        })
      }
      return result.state
    } catch (error) {
      setBackendState(defaultBackendState)
      setMessage({
        text: error?.message || t('Failed to refresh state.', '刷新状态失败。'),
        tone: 'danger',
      })
      return null
    }
  }, [applyBackendState, t])

  const scheduleVolumeUpdate = useCallback((nextVolume) => {
    const normalizedVolume = clampVolume(nextVolume)
    setVolumeDraft(normalizedVolume)
    pendingVolumeRef.current = normalizedVolume

    if (volumeTimerRef.current) {
      clearTimeout(volumeTimerRef.current)
    }

    volumeTimerRef.current = setTimeout(async () => {
      try {
        setIsVolumePending(true)
        const result = await updateBackendVolume(pendingVolumeRef.current)
        if (result?.state) {
          applyBackendState(result.state)
        }
        setMessage({
          text: t(`Volume set to ${pendingVolumeRef.current}%`, `音量已设置为 ${pendingVolumeRef.current}%`),
          tone: 'good',
        })
      } catch (error) {
        setMessage({
          text: error?.message || t('Failed to update volume.', '音量更新失败。'),
          tone: 'danger',
        })
      } finally {
        setIsVolumePending(false)
        await refreshBackendState({ silent: true })
      }
    }, 180)
  }, [applyBackendState, refreshBackendState, t])

  const sendControlAction = useCallback(async (action) => {
    if (!action) {
      return
    }

    try {
      setIsActionPending(true)
      const result = await controlBackendPlayback(action)
      if (result?.state) {
        applyBackendState(result.state)
      }

      const actionText = action === 'pause'
        ? t('Pause sent.', '已发送暂停指令。')
        : action === 'resume'
          ? t('Resume sent.', '已发送恢复指令。')
          : t('Stop sent.', '已发送停止指令。')

      setMessage({ text: actionText, tone: 'good' })
    } catch (error) {
      setMessage({
        text: error?.message || t('Failed to send control command.', '发送控制指令失败。'),
        tone: 'danger',
      })
    } finally {
      setIsActionPending(false)
      await refreshBackendState({ silent: true })
    }
  }, [applyBackendState, refreshBackendState, t])

  useEffect(() => {
    let cancelled = false

    const startPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }

      setSyncMode('polling')
      pollRef.current = setInterval(() => {
        refreshBackendState({ silent: true })
      }, 5000)
    }

    const startStream = () => {
      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
        startPolling()
        return
      }

      try {
        if (streamRef.current) {
          streamRef.current.close()
        }

        const nextStream = createBackendProgressStream()
        if (!nextStream) {
          startPolling()
          return
        }

        streamRef.current = nextStream
        setSyncMode('live')

        nextStream.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data || '{}'))
            if (!payload?.success || !payload?.state) {
              return
            }

            applyBackendState(payload.state)
          } catch {
            // ignore malformed SSE payloads
          }
        }

        nextStream.onerror = () => {
          try {
            nextStream.close()
          } catch {
            // ignore close errors
          }

          if (streamRef.current === nextStream) {
            streamRef.current = null
          }

          if (!cancelled) {
            startPolling()
          }
        }
      } catch {
        startPolling()
      }
    }

    const bootstrap = async () => {
      try {
        const result = await refreshBackendState({ silent: true })
        if (cancelled) {
          return
        }

        if (result) {
          startStream()
        } else {
          startPolling()
        }
      } catch {
        if (!cancelled) {
          startPolling()
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
      if (volumeTimerRef.current) {
        clearTimeout(volumeTimerRef.current)
      }
      if (streamRef.current) {
        streamRef.current.close()
      }
    }
  }, [applyBackendState, refreshBackendState])

  const playbackState = String(backendState.state || 'idle').trim()
  const statusMeta = getStatusMeta(backendState, t)
  const progress = backendState.progress || defaultBackendState.progress
  const progressPercent = Math.max(0, Math.min(100, Number(progress.progressPercent || 0)))
  const track = backendState.currentTrack || null
  const trackName = String(track?.programName || track?.displayName || track?.fileName || t('No track playing', '暂无播放')).trim()
  const performer = String(track?.performer || '').trim()
  const savedName = String(track?.savedName || '').trim()
  const fileName = String(track?.fileName || '').trim()
  const trackDetails = []

  if (performer) {
    trackDetails.push(t(`Performer: ${performer}`, `演出人员：${performer}`))
  }
  if (savedName) {
    trackDetails.push(t(`Saved as: ${savedName}`, `保存名：${savedName}`))
  }
  if (fileName) {
    trackDetails.push(t(`File: ${fileName}`, `文件：${fileName}`))
  }
  if (!trackDetails.length) {
    trackDetails.push(t('No additional track metadata yet.', '暂无更多曲目信息。'))
  }

  const primaryActionLabel = playbackState === 'playing'
    ? t('Pause', '暂停')
    : playbackState === 'paused'
      ? t('Resume', '恢复')
      : t('Waiting', '等待播放')

  const canPause = backendState.available && playbackState === 'playing'
  const canResume = backendState.available && playbackState === 'paused'
  const canStop = backendState.available && ['playing', 'paused'].includes(playbackState)

  return (
    <div className="mobile-control-page">
      <div className="mobile-control-shell">
        <section className="mobile-control-hero">
          <p className="mobile-control-eyebrow">Mobile Control / 手机播控</p>
          <h1 className="mobile-control-title">AurexLive</h1>
          <p className="mobile-control-subtitle">
            {t(
              'This page is optimized for phones. Keep it open during the show to pause, resume, stop, and adjust backend playback without switching back to the desktop console.',
              '这个页面针对手机优化。演出时保持开启，即可暂停、恢复、停止并调整后端播放，无需回到电脑端。',
            )}
          </p>
          <div className="mobile-control-meta">
            <span className="mobile-control-pill">
              <span className="mobile-control-pill-dot" />
              <span>{syncMode === 'live' ? t('Real-time sync', '实时同步') : syncMode === 'polling' ? t('Polling sync', '轮询同步') : t('Connecting', '正在连接')}</span>
            </span>
            <span className="mobile-control-pill">{t('Backend playback', '后端播放')}</span>
            <span className="mobile-control-pill">{t('Touch-friendly controls', '大按钮触控')}</span>
          </div>
        </section>

        <section className="mobile-control-card">
          <div className="mobile-control-card-header">
            <div>
              <h2 className="mobile-control-card-title">{t('Status', '运行状态')}</h2>
              <p className="mobile-control-card-hint">
                {t('Use the music page to choose a track first. This screen is for live control, monitoring, and quick volume changes.', '请先在音乐页选择曲目。这个页面用于现场控制、监测和快速调音。')}
              </p>
            </div>
            <span className="mobile-control-status-chip" data-tone={statusMeta.tone}>
              {statusMeta.text}
            </span>
          </div>

          <div className="mobile-control-status-grid">
            <div className="mobile-control-metric">
              <span className="mobile-control-metric-label">{t('Playback state', '播放状态')}</span>
              <span className="mobile-control-metric-value">{playbackState}</span>
            </div>
            <div className="mobile-control-metric">
              <span className="mobile-control-metric-label">{t('Driver', '音频驱动')}</span>
              <span className="mobile-control-metric-value">{backendState.available ? backendState.driver || 'available' : 'unavailable'}</span>
            </div>
            <div className="mobile-control-metric">
              <span className="mobile-control-metric-label">{t('Updated at', '最后更新')}</span>
              <span className="mobile-control-metric-value">{formatDateTime(backendState.updatedAt)}</span>
            </div>
          </div>
        </section>

        <section className="mobile-control-card mobile-control-track-card" aria-labelledby="trackSectionTitle">
          <div className="mobile-control-card-header">
            <div>
              <h2 className="mobile-control-card-title" id="trackSectionTitle">{t('Current track', '当前播放')}</h2>
              <p className="mobile-control-card-hint">
                {t('The page follows the backend player state in real time and keeps progress visible for the operator.', '页面会实时跟随后端播放器状态，并保留给操作者可见的进度。')}
              </p>
            </div>
          </div>

          <div className="mobile-control-track-main">
            <div className="mobile-control-track-name">{trackName}</div>
            <div className="mobile-control-track-meta">{trackDetails.join(' · ')}</div>
          </div>

          <div className="mobile-control-progress-area">
            <div className="mobile-control-progress-topline">
              <span>{progress?.durationSec == null ? '--:--' : `${formatTime(progress.positionSec)} / ${formatTime(progress.durationSec)}`}</span>
              <span>{`${progressPercent.toFixed(0)}%`}</span>
            </div>
            <div className="mobile-control-progress-bar" aria-hidden="true">
              <div className="mobile-control-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="mobile-control-divider" />

          <div className="mobile-control-controls-grid">
            <button
              type="button"
              className="mobile-control-button mobile-control-button-primary"
              onClick={() => sendControlAction(playbackState === 'playing' ? 'pause' : 'resume')}
              disabled={isActionPending || (!canPause && !canResume)}
            >
              {isActionPending ? t('Sending...', '发送中...') : primaryActionLabel}
            </button>
            <button
              type="button"
              className="mobile-control-button mobile-control-button-danger"
              onClick={() => sendControlAction('stop')}
              disabled={isActionPending || !canStop}
            >
              {t('Stop', '停止')}
            </button>
            <Link className="mobile-control-button mobile-control-button-secondary mobile-control-button-full" to="/page/music">
              {t('Open Music Page', '打开音乐页')}
            </Link>
          </div>
        </section>

        <section className="mobile-control-card mobile-control-volume-card" aria-labelledby="volumeSectionTitle">
          <div className="mobile-control-card-header">
            <div>
              <h2 className="mobile-control-card-title" id="volumeSectionTitle">{t('Volume', '音量')}</h2>
              <p className="mobile-control-card-hint">
                {t('Drag the slider or use a preset. Changes are sent directly to the backend player.', '拖动滑块或直接使用预设值。改动会直接发送到后端播放器。')}
              </p>
            </div>
            <span className="mobile-control-status-chip" data-tone="good">
              {`${volumeDraft}%`}
            </span>
          </div>

          <div className="mobile-control-volume-row">
            <div>
              <div className="mobile-control-volume-value">{`${volumeDraft}%`}</div>
              <div className="mobile-control-volume-label">
                {isVolumePending ? t('Updating volume...', '正在更新音量...') : t('Current backend volume', '当前后端音量')}
              </div>
            </div>
            <Link className="mobile-control-button mobile-control-button-ghost" to="/page">
              {t('Back home', '返回首页')}
            </Link>
          </div>

          <div className="mobile-control-volume-slider-wrap">
            <input
              className="mobile-control-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volumeDraft}
              aria-label={t('Backend volume', '后端音量')}
              onChange={(event) => scheduleVolumeUpdate(event.target.value)}
            />
            <div className="mobile-control-quick-grid" aria-label={t('Volume presets', '音量预设')}>
              {[0, 30, 60, 80, 100].map((preset) => (
                <button
                  key={preset}
                  className="mobile-control-quick-button"
                  type="button"
                  onClick={() => scheduleVolumeUpdate(preset)}
                >
                  {preset === 0 ? t('Mute', '静音') : `${preset}%`}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mobile-control-card">
          <div className="mobile-control-card-header">
            <div>
              <h2 className="mobile-control-card-title">{t('Tips', '提示')}</h2>
              <p className="mobile-control-card-hint">
                {t('Keep the phone awake during the show. If the page loses connection, it will fall back to polling automatically.', '演出时请保持手机常亮。如果页面断开连接，会自动切换到轮询模式。')}
              </p>
            </div>
          </div>

          <div className="mobile-control-message" data-tone={message.tone} aria-live="polite">
            {message.text}
          </div>

          <div className="mobile-control-footer-actions">
            <button
              type="button"
              className="mobile-control-button mobile-control-button-secondary"
              onClick={() => refreshBackendState({ silent: false })}
            >
              {t('Refresh', '刷新')}
            </button>
            <Link className="mobile-control-button mobile-control-button-ghost" to="/page/live-stream">
              {t('Live stream', '直播页')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export default MobileControlPage