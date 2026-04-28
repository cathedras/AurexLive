import { apiPost } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function refineSpeechText(payload) {
  return await apiPost(API_ENDPOINTS.ai.speechRefineText, payload)
}

export async function generateHostScriptSuggestions(payload) {
  return await apiPost(API_ENDPOINTS.ai.hostScriptSuggestions, payload)
}