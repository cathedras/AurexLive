import httpClient, { apiGet } from '../apiClientUtil'

export async function fetchFileList() {
  return await apiGet('/v1/files')
}

export async function uploadFileWithProgress(formData, onProgress) {
  const response = await httpClient.post('/v1/upload', formData, {
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