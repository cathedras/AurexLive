import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { FloatingAudioPlayerProvider } from './component/FloatingAudioPlayer'
import { MusicPageApiProvider } from './context/musicPageApiContext'
import HomePage from './pages/HomePage'
import LiveStreamPage from './pages/LiveStreamPage'
import LivePreviewPage from './pages/LivePreviewPage'
import MusicPage from './pages/MusicPage'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'
import RecordingPage from './pages/RecordingPage' // 导入录音页面
import WsDemo from './pages/WsDemo'

function App() {
  return (
    <FloatingAudioPlayerProvider>
      <Routes>
        <Route path="/page" element={<HomePage />} />
        <Route path="/page/live-stream" element={<LiveStreamPage />} />
        <Route path="/page/live-preview" element={<LivePreviewPage />} />
        <Route path="/page/upload" element={<UploadPage />} />
        <Route
          path="/page/music"
          element={(
            <MusicPageApiProvider>
              <MusicPage />
            </MusicPageApiProvider>
          )}
        />
        <Route path="/page/recording" element={<RecordingPage />} /> {/* 添加录音页面路由 */}
        <Route path="/page/ws-demo" element={<WsDemo />} />
        <Route path="/page/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/page" replace />} />
      </Routes>
    </FloatingAudioPlayerProvider>
  )
}

export default App