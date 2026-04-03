import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function HomePage() {
  const [currentShowText, setCurrentShowText] = useState('当前未设置演出，请先在音乐播放页保存演出。')
  const [currentProgramText, setCurrentProgramText] = useState('当前表演节目：暂无')
  const [fontScalePercent, setFontScalePercent] = useState(100)
  const [marqueeSpeedSec, setMarqueeSpeedSec] = useState(16)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [mobileLinks, setMobileLinks] = useState(null)
  const [cameraStreamActive, setCameraStreamActive] = useState(false)
  const [cameraStreamStatus, setCameraStreamStatus] = useState('connecting')
  const [cameraStreamEnabled, setCameraStreamEnabled] = useState(true)
  const [cameraPreviewSrc, setCameraPreviewSrc] = useState('')
  const cameraStreamTimeoutRef = useRef(null)
  const cameraStreamImageRef = useRef(null)

  useEffect(() => {
    fetchPageData()
  }, [])

  useEffect(() => {
    if (cameraStreamTimeoutRef.current) {
      clearTimeout(cameraStreamTimeoutRef.current)
    }

    if (!cameraStreamEnabled) {
      return undefined
    }

    cameraStreamTimeoutRef.current = setTimeout(() => {
      setCameraStreamEnabled(false)
      setCameraStreamActive(false)
      setCameraStreamStatus('disconnected')
    }, 10000)

    return () => {
      if (cameraStreamTimeoutRef.current) {
        clearTimeout(cameraStreamTimeoutRef.current)
        cameraStreamTimeoutRef.current = null
      }
    }
  }, [cameraStreamEnabled])

  const captureFirstFrameAndCloseStream = () => {
    try {
      const image = cameraStreamImageRef.current
      if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (context) {
          context.drawImage(image, 0, 0)
          setCameraPreviewSrc(canvas.toDataURL('image/png'))
        }
      }
    } catch {
      // 如果截图失败，仍然关闭流，避免首页一直挂着请求
    }

    if (cameraStreamTimeoutRef.current) {
      clearTimeout(cameraStreamTimeoutRef.current)
      cameraStreamTimeoutRef.current = null
    }

    setCameraStreamActive(true)
    setCameraStreamStatus('connected')
    setCameraStreamEnabled(false)
  }

  const fetchPageData = async () => {
    await Promise.all([fetchCurrentState(), fetchUserSettings(), fetchMobileLinks()])
  }

  const fetchMobileLinks = async () => {
    try {
      const response = await fetch('/v1/mobile/links')
      const result = await response.json()
      if (!result.success) {
        return
      }
      setMobileLinks(result)
    } catch {
      setMobileLinks(null)
    }
  }

  const fetchUserSettings = async () => {
    try {
      const response = await fetch('/v1/settings')
      const result = await response.json()
      if (!result.success || !result.settings) {
        return
      }

      const fontScale = Number(result.settings?.preferences?.fontScale || 100)
      const marqueeSpeed = Number(result.settings?.preferences?.marqueeSpeed || 16)
      const autoPlay = Boolean(result.settings?.preferences?.autoPlay)
      setFontScalePercent(Math.max(80, Math.min(140, fontScale)))
      setMarqueeSpeedSec(Math.max(6, Math.min(40, marqueeSpeed)))
      setAutoPlayEnabled(autoPlay)
    } catch {
      // keep defaults
    }
  }

  const fetchCurrentState = async () => {
    try {
      const response = await fetch('/v1/music/show/current-state')
      const result = await response.json()

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
  }

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

          <div className="current-program-panel">
            <div className="current-program-title">{currentProgramText}</div>
            <div className={`live-setting-badge ${autoPlayEnabled ? 'live-setting-badge-on' : 'live-setting-badge-off'}`}>
              自动播放：{autoPlayEnabled ? '已开启' : '已关闭'}
            </div>
            <div className="live-video-wrap">
              <div className={`live-stream-status live-stream-status-${cameraStreamStatus}`}>
                {cameraStreamStatus === 'connected' ? '已连接' : cameraStreamStatus === 'disconnected' ? '已断开' : '连接中'}
              </div>
                {cameraPreviewSrc ? (
                  <img src={cameraPreviewSrc} alt="手机摄像头首帧预览" className="live-video-image" />
                ) : !cameraStreamActive ? (
                  <img src="/live-placeholder.svg" alt="视频直播窗口占位图" className="live-video-image" />
                ) : null}
                {cameraStreamEnabled && (
                  <img
                    ref={cameraStreamImageRef}
                    //src="/v1/live/camera-stream"
                    alt="手机摄像头实时回传画面"
                    className={`live-video-image ${cameraPreviewSrc ? 'live-video-image-hidden' : ''}`}
                    onLoad={captureFirstFrameAndCloseStream}
                    onError={() => {
                      if (cameraStreamTimeoutRef.current) {
                        clearTimeout(cameraStreamTimeoutRef.current)
                        cameraStreamTimeoutRef.current = null
                      }
                      setCameraStreamEnabled(false)
                      setCameraStreamActive(false)
                      setCameraStreamStatus('disconnected')
                    }}
                  />
                )}
            </div>
            <div className="program-marquee-wrap" aria-label="当前节目滚动展示" style={{ '--home-marquee-speed': `${Math.max(6, marqueeSpeedSec - 2)}s` }}>
              <div className="program-marquee-track">
                <span>{currentProgramText}</span>
                <span>{currentProgramText}</span>
              </div>
            </div>

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
