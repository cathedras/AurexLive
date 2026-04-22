import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  fetchCurrentShowState as loadCurrentShowState,
  fetchMobileLinks as loadMobileLinks,
  fetchUserSettings as loadUserSettings,
} from '../services/home/homePageService'

import HomeLivePreviewPlayer from '../component/HomeLivePreviewPlayer'

function HomePage() {
  const [currentShowText, setCurrentShowText] = useState('当前未设置演出，请先在音乐播放页保存演出。')
  const [currentProgramText, setCurrentProgramText] = useState('当前表演节目：暂无')
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [mobileLinks, setMobileLinks] = useState(null)

  const fetchCurrentState = useCallback(async () => {
    try {
      const result = await loadCurrentShowState()

      if (!result.success) {
        throw new Error(result.message || '状态获取失败')
      }

      if (!result.hasCurrentShow || !result.currentShow) {
        setCurrentShowText('当前未设置演出，请先在音乐播放页保存演出。')
      } else {
        setCurrentShowText(`当前演出：${result.currentShow.recordName}`)
      }

      if (!result.hasCurrentProgram || !result.currentProgram) {
        setCurrentProgramText('当前表演节目：暂无')
      } else {
        const performer = result.currentProgram.performer || '未知演出人'
        const programName = result.currentProgram.programName || '未命名节目'
        setCurrentProgramText(`当前表演节目：${programName} · 演出人员：${performer}`)
      }
    } catch {
      setCurrentShowText('当前演出获取失败，请稍后刷新重试。')
      setCurrentProgramText('当前表演节目获取失败，请稍后刷新重试。')
    }
  }, [])

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
    fetchPageData()
  }, [fetchPageData])

  return (
    <div className="container" style={{ fontSize: `${fontScalePercent}%` }}>
      <header className="home-header">
        <h1 className="home-title">演出中台</h1>
        <div className="home-actions">
          <Link to="/page/upload" className="home-link-btn">上传文件</Link>
          <Link to="/page/music" className="home-link-btn home-link-btn-secondary">音乐播放页</Link>
          <Link to="/page/settings" className="home-link-btn home-link-btn-secondary">用户设置</Link>
        </div>
      </header>

      <main className="home-main">
        <div className="home-panel">
          <p className="home-desc">欢迎使用演出中台，可进入上传页或音乐播放页进行操作。</p>
          <div className="show-marquee-wrap" aria-label="当前演出" style={{ '--home-marquee-speed': `${marqueeSpeedSec}s` }}>
            <div className="show-marquee-track">
              <span>{currentShowText}</span>
              <span>{currentShowText}</span>
            </div>
          </div>
          <div className="program-marquee-wrap" aria-label="当前节目滚动展示" style={{ '--home-marquee-speed': `${Math.max(6, marqueeSpeedSec - 2)}s` }}>
            <div className="program-marquee-track">
              <span>{currentProgramText}</span>
              <span>{currentProgramText}</span>
            </div>
          </div>
          <div className="current-program-panel">
            <HomeLivePreviewPlayer />
            <div className="qr-section">
              <div className="qr-title">手机访问二维码（仅手机端使用）</div>
              <div className="qr-grid">
                <div className="qr-card">
                  <div className="qr-card-title">摄像头回传页面</div>
                  {mobileLinks?.qrs?.camera ? <img src={mobileLinks.qrs.camera} className="qr-image" alt="摄像头回传二维码" /> : <div className="qr-placeholder">二维码加载中</div>}
                  <div className="qr-link" title={mobileLinks?.links?.camera}>{mobileLinks?.links?.camera || '-'}</div>
                </div>
                <div className="qr-card">
                  <div className="qr-card-title">手机播控页面</div>
                  {mobileLinks?.qrs?.control ? <img src={mobileLinks.qrs.control} className="qr-image" alt="手机播控二维码" /> : <div className="qr-placeholder">二维码加载中</div>}
                  <div className="qr-link" title={mobileLinks?.links?.control}>{mobileLinks?.links?.control || '-'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default HomePage
