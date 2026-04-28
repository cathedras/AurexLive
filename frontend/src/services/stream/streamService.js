import { API_ENDPOINTS } from '../webApiConfig'

export function createBackendProgressStream() {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    return null
  }

  return new window.EventSource(API_ENDPOINTS.stream.backendProgress)
}