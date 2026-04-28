import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useLanguage } from '../context/languageContext'

import {
  fetchCurrentShowState as loadCurrentShowState,
  fetchMobileLinks as loadMobileLinks,
  fetchUserSettings as loadUserSettings,
} from '../services/home/homePageService'

import HomeLivePreviewPlayer from '../component/HomeLivePreviewPlayer'

function HomePage() {
  const { t } = useLanguage()
  const [currentShowText, setCurrentShowText] = useState('No show is set yet. Save one from the music page first.')
  const [currentProgramText, setCurrentProgramText] = useState('Current track: none')
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [mobileLinks, setMobileLinks] = useState(null)
  const [isQrSectionCollapsed, setIsQrSectionCollapsed] = useState(false)

  const fetchCurrentState = useCallback(async () => {
    try {
      const result = await loadCurrentShowState()

      if (!result.success) {
        throw new Error(result.message || t('Failed to load state', '状态获取失败'))
      }

      if (!result.hasCurrentShow || !result.currentShow) {
        setCurrentShowText(t('No show is set yet. Save one from the music page first.', '当前未设置演出，请先在音乐播放页保存演出。'))
      } else {
        setCurrentShowText(t(`Current show: ${result.currentShow.recordName}`, `当前演出：${result.currentShow.recordName}`))
      }

      if (!result.hasCurrentProgram || !result.currentProgram) {
        setCurrentProgramText(t('Current track: none', '当前表演节目：暂无'))
      } else {
        const performer = result.currentProgram.performer || t('Unknown performer', '未知演出人')
        const programName = result.currentProgram.programName || t('Untitled track', '未命名节目')
        setCurrentProgramText(t(`Current track: ${programName} · Performer: ${performer}`, `当前表演节目：${programName} · 演出人员：${performer}`))
      }
    } catch {
      setCurrentShowText(t('Failed to load the current show. Refresh and try again later.', '当前演出获取失败，请稍后刷新重试。'))
      setCurrentProgramText(t('Failed to load the current track. Refresh and try again later.', '当前表演节目获取失败，请稍后刷新重试。'))
    }
  }, [t])

  const fetchMobileLinks = useCallback(async () => {
    try {
      const result = await loadMobileLinks()
      if (!result.success) {
        return
      }
      setMobileLinks(result)
    } catch {
      setMobileLinks(null)
    }
  }, [])

  const fetchUserSettings = useCallback(async () => {
    try {
      const result = await loadUserSettings()
      if (!result.success || !result.settings) {
        return
      }

      const fontScale = Number(result.settings?.preferences?.fontScale || 100)
      const marqueeSpeed = Number(result.settings?.preferences?.marqueeSpeed || 16)
      setFontScalePercent(Math.max(80, Math.min(140, fontScale)))
      setMarqueeSpeedSec(Math.max(6, Math.min(40, marqueeSpeed)))
    } catch {
      // keep defaults
    }
  }, [])

  const fetchPageData = useCallback(async () => {
    await Promise.all([fetchCurrentState(), fetchUserSettings(), fetchMobileLinks()])
  }, [fetchCurrentState, fetchMobileLinks, fetchUserSettings])

  useEffect(() => {
    let cancelled = false

    const loadPageData = async () => {
      await fetchPageData()
      if (cancelled) {
        return
      }
    }

    loadPageData()

    return () => {
      cancelled = true
    }
  }, [fetchPageData])

  return (
    <div className="container" style={{ fontSize: `${fontScalePercent}%` }}>
      <header className="home-header">
        <h1 className="home-title">{t('AurexLive', 'AurexLive')}</h1>
        <div className="home-actions">
          <Link to="/page/upload" className="home-link-btn">{t('Upload', '上传文件')}</Link>
          <Link to="/page/music" className="home-link-btn home-link-btn-secondary">{t('Music', '音乐播放页')}</Link>
          <Link to="/page/settings" className="home-link-btn home-link-btn-secondary">{t('Settings', '用户设置')}</Link>
        </div>
      </header>

      <main className="home-main">
        <div className="home-panel">
          <p className="home-desc">{t('Welcome to AurexLive. Use the upload page or the music page to get started.', '欢迎使用AurexLive，可进入上传页或音乐播放页进行操作。')}</p>
          <div className="show-marquee-wrap" aria-label={t('Current show', '当前演出')} style={{ '--home-marquee-speed': `${marqueeSpeedSec}s` }}>
            <div className="show-marquee-track">
              <span>{currentShowText}</span>
              <span>{currentShowText}</span>
            </div>
          </div>
          <div className="program-marquee-wrap" aria-label={t('Current track marquee', '当前节目滚动展示')} style={{ '--home-marquee-speed': `${Math.max(6, marqueeSpeedSec - 2)}s` }}>
            <div className="program-marquee-track">
              <span>{currentProgramText}</span>
              <span>{currentProgramText}</span>
            </div>
          </div>
          <div className="current-program-panel">
            <HomeLivePreviewPlayer />
            <div className="qr-section">
              <div className="qr-section-header">
                <div className="qr-title">{t('Mobile access QR codes (mobile only)', '手机访问二维码（仅手机端使用）')}</div>
                <button
                  type="button"
                  className="qr-toggle-btn"
                  onClick={() => setIsQrSectionCollapsed((current) => !current)}
                  aria-expanded={!isQrSectionCollapsed}
                  aria-controls="home-qr-grid"
                >
                  {isQrSectionCollapsed ? t('Show QR codes', '展开二维码') : t('Hide QR codes', '收起二维码')}
                </button>
              </div>
              {!isQrSectionCollapsed && (
                <div className="qr-grid" id="home-qr-grid">
                  <div className="qr-card">
                    <div className="qr-card-title">{t('Camera return page', '摄像头回传页面')}</div>
                    {mobileLinks?.qrs?.camera ? <img src={mobileLinks.qrs.camera} className="qr-image" alt={t('Camera return QR code', '摄像头回传二维码')} /> : <div className="qr-placeholder">{t('Loading QR code...', '二维码加载中')}</div>}
                    <div className="qr-link" title={mobileLinks?.links?.camera}>{mobileLinks?.links?.camera || '-'}</div>
                  </div>
                  <div className="qr-card">
                    <div className="qr-card-title">{t('Mobile control page', '手机播控页面')}</div>
                    {mobileLinks?.qrs?.control ? <img src={mobileLinks.qrs.control} className="qr-image" alt={t('Mobile control QR code', '手机播控二维码')} /> : <div className="qr-placeholder">{t('Loading QR code...', '二维码加载中')}</div>}
                    <div className="qr-link" title={mobileLinks?.links?.control}>{mobileLinks?.links?.control || '-'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default HomePage
