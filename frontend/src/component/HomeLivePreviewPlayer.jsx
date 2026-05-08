import { useLanguage } from '../context/languageContext'
import { useLivePreviewPlayer } from '../hooks/livePreview'

function HomeLivePreviewPlayer() {
  const { t } = useLanguage()
  const {
    videoRef,
    status,
    errorMessage,
    monitorStatus,
    latestSession: previewSession,
    resolvedSessionId,
    isLatestSessionLoading,
    isLoading,
    isPlaying,
    startPreview,
    stopPreview,
  } = useLivePreviewPlayer({ autoStart: false })

  const previewStatus = resolvedSessionId
    ? status
    : (isLatestSessionLoading ? t('Finding the latest live session...', '正在查找最新会话...') : t('Click the big button to start previewing.', '点击大按钮开始预览。'))

  const monitorText = resolvedSessionId
    ? monitorStatus
    : (isLatestSessionLoading ? t('Loading...', '加载中...') : t('Disconnected', '未连接'))

  const handleStartPreview = async () => {
    try {
      await startPreview()
    } catch (error) {
      console.error('Home preview start failed:', error)
    }
  }

  return (
    <div className="home-live-preview-card">
      <div className="home-live-preview-stage">
        <video
          ref={videoRef}
          className="home-live-preview-video"
          playsInline
          muted
          autoPlay
        />
        {!isPlaying && (
          <div className="home-live-preview-overlay">
            <div className="home-live-preview-overlay-glow" />
            <div className="home-live-preview-overlay-content">
              <button
                type="button"
                className="home-live-preview-play-button"
                onClick={handleStartPreview}
                disabled={isLoading}
                aria-label={t('Start preview', '开始预览')}
              >
                <span className="home-live-preview-play-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="home-live-preview-footer">
        <div className="home-live-preview-status-row">
          <span className="home-live-preview-status-text">{previewStatus}</span>
          <span className={`home-live-preview-status-pill home-live-preview-status-pill-${monitorText === t('Connected', '已连接') ? 'connected' : monitorText === t('Connection failed', '连接失败') ? 'error' : 'idle'}`}>
            {monitorText}
          </span>
        </div>

        {isPlaying ? (
          <button type="button" onClick={stopPreview} className="home-live-preview-secondary-btn">
            {t('Stop preview', '停止预览')}
          </button>
        ) : null}
      </div>

      {previewSession ? (
        <div className="home-live-preview-error-line">
          {t(`Latest session: ${previewSession?.sessionId || ''}`, `最新会话：${previewSession?.sessionId || ''}`)}
        </div>
      ) : null}

      {errorMessage ? <div className="home-live-preview-error-line">{errorMessage}</div> : null}
    </div>
  )
}

export default HomeLivePreviewPlayer
