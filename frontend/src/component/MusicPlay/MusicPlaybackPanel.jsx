import { useEffect, useRef } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Pause, RotateCw, Square, Volume1, Volume2, VolumeX } from 'lucide-react'

function BackendActionButton({ label, onClick, disabled = false, children }) {
  return (
    <Tooltip.Root delayDuration={120}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="music-backend-icon-btn"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          <span className="music-backend-icon-btn-graphic" aria-hidden="true">{children}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
          {label}
          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function MusicPlaybackPanel({
  currentTrack,
  backendPlayback,
  backendPlaybackLabel,
  backendVolumePercent,
  playbackPositionLabel,
  playbackDurationLabel,
  playbackProgressPercent,
  pauseTip,
  resumeTip,
  stopTip,
  canPauseBackendPlayback,
  canResumeBackendPlayback,
  canStopBackendPlayback,
  canAdjustBackendVolume,
  onControlBackendPlayback,
  onBackendVolumeChange,
}) {
  const previousVolumeRef = useRef(100)

  useEffect(() => {
    if (backendVolumePercent > 0) {
      previousVolumeRef.current = backendVolumePercent
    }
  }, [backendVolumePercent])

  const handleToggleMute = () => {
    if (!canAdjustBackendVolume) {
      return
    }

    if (backendVolumePercent <= 0) {
      onBackendVolumeChange(previousVolumeRef.current > 0 ? previousVolumeRef.current : 100)
      return
    }

    previousVolumeRef.current = backendVolumePercent
    onBackendVolumeChange(0)
  }

  const VolumeIcon = backendVolumePercent <= 0 ? VolumeX : backendVolumePercent < 50 ? Volume1 : Volume2

  return (
    <Tooltip.Provider delayDuration={120}>
      <div className="music-player-panel">
        <div className="music-playing-title">
          {currentTrack
            ? `当前节目：${currentTrack.performer} - ${currentTrack.programName}`
            : '请选择下方音乐进行播放'}
        </div>
        <div className="music-backend-status">
          <span>播放状态：{backendPlaybackLabel}</span>
          {backendPlayback.currentTrack?.programName && (
            <span>
              当前播放：{backendPlayback.currentTrack.performer || '未知演出人'} - {backendPlayback.currentTrack.programName}
            </span>
          )}
          {backendPlayback.errorMessage && <span>错误：{backendPlayback.errorMessage}</span>}
        </div>
        <div className="music-progress-panel" aria-label="当前播放进度">
          <div className="music-progress-time">
            <span>{playbackPositionLabel}</span>
            <span>{playbackDurationLabel}</span>
          </div>
          <div className="music-volume-popover">
            <button
              type="button"
              className="music-volume-trigger"
              onClick={handleToggleMute}
              disabled={!canAdjustBackendVolume}
              aria-label={backendVolumePercent <= 0 ? '取消静音' : '一键静音'}
              title={backendVolumePercent <= 0 ? '取消静音' : '一键静音'}
            >
              <VolumeIcon className="music-volume-trigger-icon" strokeWidth={1.8} />
            </button>
            <div className="music-volume-flyout">
              <span className="music-volume-value">{backendVolumePercent}%</span>
              <div
                className="music-volume-slider-shell"
                style={{ '--music-volume-percent': `${backendVolumePercent}%` }}
              >
                <input
                  type="range"
                  className="music-volume-slider"
                  orient="vertical"
                  min="0"
                  max="100"
                  step="1"
                  value={backendVolumePercent}
                  onChange={(event) => onBackendVolumeChange(Number(event.target.value))}
                  disabled={!canAdjustBackendVolume}
                  aria-label="播放音量控制"
                />
              </div>
            </div>
          </div>
          <div className="music-progress-track">
            <div className="music-progress-fill" style={{ width: `${playbackProgressPercent}%` }} />
          </div>
        </div>
        <div className="music-backend-actions">
          <BackendActionButton label={pauseTip} onClick={() => onControlBackendPlayback('pause')} disabled={!canPauseBackendPlayback}>
            <Pause className="music-backend-action-icon" strokeWidth={1.8} />
          </BackendActionButton>
          <BackendActionButton label={resumeTip} onClick={() => onControlBackendPlayback('resume')} disabled={!canResumeBackendPlayback}>
            <RotateCw className="music-backend-action-icon" strokeWidth={1.8} />
          </BackendActionButton>
          <BackendActionButton label={stopTip} onClick={() => onControlBackendPlayback('stop')} disabled={!canStopBackendPlayback}>
            <Square className="music-backend-action-icon" strokeWidth={1.8} />
          </BackendActionButton>
        </div>
      </div>
    </Tooltip.Provider>
  )
}

export default MusicPlaybackPanel