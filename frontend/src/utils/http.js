import axios from 'axios'

const httpClient = axios.create({
  timeout: 15000,
})

export async function apiGet(url, config = {}) {
  const response = await httpClient.get(url, config)
  return response.data
}

export async function apiPost(url, data = {}, config = {}) {
  const response = await httpClient.post(url, data, config)
  return response.data
}

export function getRequestErrorMessage(error, fallback = '请求失败') {
  const responseData = error?.response?.data
  if (responseData && typeof responseData === 'object' && responseData.message) {
    return String(responseData.message)
  }

  if (error?.message) {
    return String(error.message)
  }

  return fallback
}

export default httpClient
