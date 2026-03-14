function MusicPlaybackPanel({
  currentTrack,
  backendPlayback,
  backendPlaybackLabel,
  playbackPositionLabel,
  playbackDurationLabel,
  playbackProgressPercent,
  pauseTip,
  resumeTip,
  stopTip,
  canPauseBackendPlayback,
  canResumeBackendPlayback,
  canStopBackendPlayback,
  onControlBackendPlayback,
}) {
  return (
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
        <div className="music-progress-track">
          <div className="music-progress-fill" style={{ width: `${playbackProgressPercent}%` }} />
        </div>
      </div>
      <div className="music-backend-actions">
        <span className="music-backend-action-wrap" data-tip={pauseTip}>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => onControlBackendPlayback('pause')}
            disabled={!canPauseBackendPlayback}
          >
            暂停
          </button>
        </span>
        <span className="music-backend-action-wrap" data-tip={resumeTip}>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => onControlBackendPlayback('resume')}
            disabled={!canResumeBackendPlayback}
          >
            恢复
          </button>
        </span>
        <span className="music-backend-action-wrap" data-tip={stopTip}>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => onControlBackendPlayback('stop')}
            disabled={!canStopBackendPlayback}
          >
            停止
          </button>
        </span>
      </div>
    </div>
  )
}

export default MusicPlaybackPanel