import { createContext, createElement, useContext, useMemo } from 'react'
import httpClient, { apiGet, apiPost } from '../utils/http'

const MusicPageApiContext = createContext(null)

export function MusicPageApiProvider({ children }) {
  const value = useMemo(() => ({
    fetchBackendPlaybackState: async () => apiGet('/v1/music/backend-state'),
    fetchHistoryShows: async () => apiGet('/v1/shows'),
    switchToHistoryShow: async (fileName, clearCurrentProgram = true) => apiPost('/v1/show/current', {
      fileName,
      clearCurrentProgram,
    }),
    reportClientError: async (payload) => apiPost('/v1/client-error', payload),
    fetchUserSettings: async () => apiGet('/v1/settings'),
    fetchCurrentShowState: async () => apiGet('/v1/show/current-state'),
    fetchMusicList: async () => apiGet('/v1/musiclist'),
    fetchUploadedFiles: async () => apiGet('/v1/files'),
    updateCurrentProgram: async (payload) => apiPost('/v1/show/current-program', payload),
    playBackendTrack: async (payload) => apiPost('/v1/music/backend-play', payload),
    controlBackendPlayback: async (action) => apiPost('/v1/music/backend-control', { action }),
    fetchPreviewSource: async (fileName) => apiPost('/v1/music/preview-source', { fileName }),
    refineSpeechText: async (payload) => apiPost('/v1/ai/speech-refine-text', payload),
    saveMusicList: async (payload) => apiPost('/v1/musiclist/save', payload),
    generateHostScriptSuggestions: async (payload) => apiPost('/v1/ai/host-script-suggestions', payload),
    exportProgramSheetPdf: async (payload) => {
      const response = await httpClient.post('/v1/musiclist/export-pdf', payload, {
        responseType: 'blob',
      })

      return response.data
    },
  }), [])

  return createElement(MusicPageApiContext.Provider, { value }, children)
}

export function useMusicPageApi() {
  const context = useContext(MusicPageApiContext)

  if (!context) {
    throw new Error('useMusicPageApi 必须在 MusicPageApiProvider 内使用')
  }

  return context
}