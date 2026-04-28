import httpClient, { apiGet } from '../apiClientUtil'
import { API_ENDPOINTS } from '../webApiConfig'

export async function fetchFileList() {
  return await apiGet(API_ENDPOINTS.files.list)
}

export async function uploadFileWithProgress(formData, onProgress) {
  const response = await httpClient.post(API_ENDPOINTS.files.upload, formData, {
    onUploadProgress: (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') {
        return
      }

      const percent = Math.round((event.loaded / event.total) * 100)
      onProgress(percent)
    }
  })

  return response.data
}