import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { FloatingAudioPlayerProvider } from './component/FloatingAudioPlayer'
import LanguageSwitcher from './component/LanguageSwitcher'
import { LanguageProvider } from './context/languageContext'
import { MusicPageApiProvider } from './context/musicPageApiContext'
import HomePage from './pages/HomePage'
import MobileControlPage from './pages/MobileControlPage'
import LiveStreamPage from './pages/LiveStreamPage'
import LivePreviewPage from './pages/LivePreviewPage'
import MusicPage from './pages/MusicPage'
import SystemNoticePage from './pages/SystemNoticePage'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'
import RecordingPage from './pages/RecordingPage' // 导入录音页面
import WsDemo from './pages/WsDemo'

function App() {
  return (
    <LanguageProvider>
      <FloatingAudioPlayerProvider>
        <div className="app-shell">
          <div className="app-language-switcher">
            <LanguageSwitcher />
          </div>
          <Routes>
            <Route path="/page" element={<HomePage />} />
            <Route path="/page/live-stream" element={<LiveStreamPage />} />
            <Route path="/page/live-preview" element={<LivePreviewPage />} />
            <Route path="/page/mobile-control" element={<MobileControlPage />} />
            <Route path="/page/error/404" element={<SystemNoticePage variant="notFound" />} />
            <Route path="/page/error/500" element={<SystemNoticePage variant="serverError" />} />
            <Route path="/page/build-missing" element={<SystemNoticePage variant="buildMissing" />} />
            <Route path="/page/upload" element={<UploadPage />} />
            <Route
              path="/page/music"
              element={(
                <MusicPageApiProvider>
                  <MusicPage />
                </MusicPageApiProvider>
              )}
            />
            <Route path="/page/recording" element={<RecordingPage />} />
            <Route path="/page/ws-demo" element={<WsDemo />} />
            <Route path="/page/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/page" replace />} />
          </Routes>
        </div>
      </FloatingAudioPlayerProvider>
    </LanguageProvider>
  )
}

export default App