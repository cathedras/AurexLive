import httpClient, { apiGet, apiPost } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchBackendPlaybackState() {
  return await apiGet(API_ENDPOINTS.music.backendState)
}

export async function fetchHistoryShows() {
  return await apiGet(API_ENDPOINTS.music.shows)
}

export async function switchToHistoryShow(fileName, clearCurrentProgram = true) {
  return await apiPost(API_ENDPOINTS.music.showCurrent, {
    fileName,
    clearCurrentProgram,
  })
}

export async function closeCurrentShow() {
  return await apiPost(API_ENDPOINTS.music.showCurrentClose, {})
}

export async function deleteHistoryShow(fileName) {
  const response = await httpClient.delete(API_ENDPOINTS.music.showDetail(fileName))
  return response.data
}

export async function updateCurrentShowLock(locked) {
  return await apiPost(API_ENDPOINTS.music.showCurrentLock, { locked })
}

export async function reportClientError(payload) {
  return await apiPost(API_ENDPOINTS.client.errorReport, payload)
}

export async function fetchCurrentShowState() {
  return await apiGet(API_ENDPOINTS.music.showCurrentState)
}

export async function fetchMusicList() {
  return await apiGet(API_ENDPOINTS.music.musicList)
}

export async function createRuntimeTrack(payload) {
  return await apiPost(API_ENDPOINTS.music.musicListRuntimeTrack, payload)
}

export async function updateCurrentProgram(payload) {
  return await apiPost(API_ENDPOINTS.music.showCurrentProgram, payload)
}

export async function playBackendTrack(payload) {
  return await apiPost(API_ENDPOINTS.music.backendPlay, payload)
}

export async function controlBackendPlayback(action) {
  return await apiPost(API_ENDPOINTS.music.backendControl, { action })
}

export async function updateBackendVolume(volume) {
  return await apiPost(API_ENDPOINTS.music.backendVolume, { volume })
}

export async function fetchPreviewSource(fileName) {
  return await apiPost(API_ENDPOINTS.music.previewSource, { fileName })
}

export async function saveMusicList(payload) {
  return await apiPost(API_ENDPOINTS.music.musicListSave, payload)
}

export async function exportProgramSheetPdf(payload) {
  const response = await httpClient.post(API_ENDPOINTS.music.musicListExportPdf, payload, {
    responseType: 'blob',
  })

  return response.data
}