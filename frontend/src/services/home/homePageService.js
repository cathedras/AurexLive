import { apiGet } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchMobileLinks() {
  return await apiGet(API_ENDPOINTS.mobile.links)
}

export async function fetchUserSettings() {
  return await apiGet(API_ENDPOINTS.settings.user)
}

export async function fetchCurrentShowState() {
  return await apiGet(API_ENDPOINTS.music.showCurrentState)
}

export async function fetchWebRtcSessions() {
  return await apiGet(API_ENDPOINTS.webrtc.sessions)
}