import { useCallback, useEffect, useState } from 'react'

import { useLanguage } from '../context/languageContext'
import { fetchWebRtcSessions } from '../services/home/homePageService'

function pickLatestSession(sessions) {
  const sortedSessions = [...(Array.isArray(sessions) ? sessions : [])]
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())

  return (
    sortedSessions.find((session) => Number(session?.producerCount || 0) > 0)
    || sortedSessions.find((session) => Number(session?.transportCount || 0) > 0)
    || sortedSessions[0]
    || null
  )
}

function HomeLivePreviewPlayer() {
  const { t } = useLanguage()
  const [previewSession, setPreviewSession] = useState(null)
  const [previewStatus, setPreviewStatus] = useState(t('Click the big button to start previewing.', '点击大按钮开始预览。'))
  const [monitorStatus, setMonitorStatus] = useState(t('Disconnected', '未连接'))
  const [errorMessage, setErrorMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadLatestSession = useCallback(async () => {
    const result = await fetchWebRtcSessions()
    if (!result.success || !Array.isArray(result.sessions) || result.sessions.length === 0) {
      setPreviewSession(null)
      return null
    }

    const latestSession = pickLatestSession(result.sessions)
    setPreviewSession(latestSession)
    return latestSession
  }, [])

  const startPreview = async () => {
    if (isLoading) {
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const session = await loadLatestSession()
      if (!session) {
        setPreviewStatus(t('No live session yet. Start streaming from the live publish page first.', '暂无直播会话，请先在直播发布页启动推流。'))
        setMonitorStatus(t('Disconnected', '未连接'))
        setIsPlaying(false)
        return
      }

      setIsPlaying(true)
      setMonitorStatus(t('Connected', '已连接'))
      setPreviewStatus(t('The session is connected and waiting for the host to stream.', '会话已连接，正在等待主播推流。'))
    } catch (error) {
      setErrorMessage(error.message || t('Preview failed to start.', '预览启动失败'))
      setPreviewStatus(t('Preview failed to start.', '预览启动失败。'))
      setMonitorStatus(t('Connection failed', '连接失败'))
      setIsPlaying(false)
    } finally {
      setIsLoading(false)
    }
  }

  const stopPreview = () => {
    setIsPlaying(false)
    setMonitorStatus(t('Disconnected', '未连接'))
    setPreviewStatus(previewSession ? t('Preview stopped.', '预览已停止。') : t('Click the big button to start previewing.', '点击大按钮开始预览。'))
  }

  useEffect(() => {
    loadLatestSession().catch(() => {
      setPreviewSession(null)
    })
  }, [loadLatestSession])

  return (
    <div className="home-live-preview-card">
      <div className="home-live-preview-stage">
        <div className="home-live-preview-overlay">
          <div className="home-live-preview-overlay-glow" />
          <div className="home-live-preview-overlay-content">
            <button
              type="button"
              className="home-live-preview-play-button"
              onClick={startPreview}
              disabled={isLoading}
              aria-label={t('Start preview', '开始预览')}
            >
              <span className="home-live-preview-play-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="home-live-preview-footer">
        <div className="home-live-preview-status-row">
          <span className="home-live-preview-status-text">{previewStatus}</span>
          <span className={`home-live-preview-status-pill home-live-preview-status-pill-${monitorStatus === t('Connected', '已连接') ? 'connected' : monitorStatus === t('Connection failed', '连接失败') ? 'error' : 'idle'}`}>
            {monitorStatus}
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
