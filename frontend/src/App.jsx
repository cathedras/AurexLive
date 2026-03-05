import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import HomePage from './pages/HomePage'
import MusicPage from './pages/MusicPage'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'

function App() {
  return (
    <Routes>
      <Route path="/page" element={<HomePage />} />
      <Route path="/page/upload" element={<UploadPage />} />
      <Route path="/page/music" element={<MusicPage />} />
      <Route path="/page/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/page" replace />} />
    </Routes>
  )
}

export default App
