import { apiGet, apiPost } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchSettings() {
  return await apiGet(API_ENDPOINTS.settings.user)
}

export async function saveSettings(settings) {
  return await apiPost(API_ENDPOINTS.settings.user, { settings })
}