import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { FloatingAudioPlayerProvider } from './component/FloatingAudioPlayer'
import { MusicPageApiProvider } from './context/musicPageApiContext'
import HomePage from './pages/HomePage'
import MusicPage from './pages/MusicPage'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'

function App() {
  return (
    <FloatingAudioPlayerProvider>
      <Routes>
        <Route path="/page" element={<HomePage />} />
        <Route path="/page/upload" element={<UploadPage />} />
        <Route
          path="/page/music"
          element={(
            <MusicPageApiProvider>
              <MusicPage />
            </MusicPageApiProvider>
          )}
        />
        <Route path="/page/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/page" replace />} />
      </Routes>
    </FloatingAudioPlayerProvider>
  )
}

export default App
