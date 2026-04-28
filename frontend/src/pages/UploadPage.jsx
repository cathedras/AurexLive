import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useLanguage } from '../context/languageContext'

import { fetchFileList as loadFileList, uploadFileWithProgress } from '../services/upload/uploadService'

function UploadPage() {
  const { t } = useLanguage()
  const [selectedFile, setSelectedFile] = useState(null)
  const [message, setMessage] = useState('Waiting for a file...')
  const [messageType, setMessageType] = useState('success')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [files, setFiles] = useState([])

  const showMessage = (text, type = 'success') => {
    setMessage(text)
    setMessageType(type)
  }

  const handleSelectFile = (event) => {
    const nextFile = event.target.files?.[0]
    if (!nextFile) {
      setSelectedFile(null)
      return
    }

    setSelectedFile(nextFile)
    showMessage(t(`Selected file: ${nextFile.name} (${formatFileSize(nextFile.size)})`, `已选择文件：${nextFile.name} (${formatFileSize(nextFile.size)})`))
  }

  const handleDrop = (event) => {
    event.preventDefault()
    const nextFile = event.dataTransfer.files?.[0]
    if (!nextFile) return

    setSelectedFile(nextFile)
    showMessage(t(`Selected file: ${nextFile.name} (${formatFileSize(nextFile.size)})`, `已选择文件：${nextFile.name} (${formatFileSize(nextFile.size)})`))
  }

  const uploadFile = async () => {
    if (!selectedFile || isUploading) {
      showMessage(t('Please select a file to upload first.', '请先选择要上传的文件'), 'error')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      setIsUploading(true)
      setUploadPercent(0)
      showMessage(t('Uploading...', '正在上传...'))

      const result = await uploadWithProgress(formData, (percent) => {
        setUploadPercent(percent)
      })

      if (result.success) {
        showMessage(t(`Upload successful! File saved as: ${result.fileInfo.name}`, `上传成功！文件已保存：${result.fileInfo.name}`))
        await fetchFileList()
      } else {
        throw new Error(result.message)
      }
    } catch (error) {
      showMessage(t(`Upload failed: ${error.message}`, `上传失败：${error.message}`), 'error')
    } finally {
      setTimeout(() => {
        setIsUploading(false)
        setUploadPercent(0)
        setSelectedFile(null)
        showMessage(t('Waiting for a file...', '等待选择文件...'))
      }, 1200)
    }
  }

  const fetchFileList = useCallback(async () => {
    try {
      const result = await loadFileList()
      if (!result.success) {
        throw new Error(result.message || t('Load failed', '加载失败'))
      }

      setFiles(result.files || [])
    } catch (error) {
      setFiles([])
      showMessage(t(`Failed to load list: ${error.message}`, `列表加载失败：${error.message}`), 'error')
    }
  }, [t])

  useEffect(() => {
    fetchFileList()
  }, [fetchFileList])

  return (
    <div className="container">
      <div className="page-actions">
        <Link to="/page" className="back-link">{t('Back to home', '返回首页')}</Link>
      </div>
      <h1>{t('File upload', '文件上传')}</h1>

      <label
        className="upload-area"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="upload-icon">📁</div>
        <div className="upload-text">{t('Click or drag a file here to upload', '点击或拖拽文件到此处上传')}</div>
        <input
          type="file"
          id="fileInput"
          onChange={handleSelectFile}
        />
      </label>

      <button
        className="upload-btn"
        onClick={uploadFile}
        disabled={!selectedFile || isUploading}
      >
        {isUploading ? t('Uploading...', '上传中...') : t('Start upload', '开始上传')}
      </button>

      {isUploading && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${uploadPercent}%` }} />
        </div>
      )}

      <div className={`message ${messageType}`}>{message}</div>

      <div className="file-list-wrap">
        <div className="file-list-header">
          <div className="file-list-title">{t('Uploaded files', '已上传文件列表')}</div>
          <button className="refresh-btn" onClick={fetchFileList}>{t('Refresh list', '刷新列表')}</button>
        </div>
        <ul className="file-list">
          {files.length === 0 ? (
            <li className="empty-text">{t('No uploaded files yet.', '暂无已上传文件')}</li>
          ) : (
            files.map((file) => (
              <li className="file-item" key={file.savedName}>
                <span className="file-name" title={file.displayName || file.savedName}>{file.displayName || file.savedName}</span>
                <span className="file-meta">{formatFileSize(file.size)} · {formatDateTime(file.uploadTime)}</span>
                <a className="file-link" href={file.url} target="_blank" rel="noreferrer">{t('Open', '查看')}</a>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function uploadWithProgress(formData, onProgress) {
  return uploadFileWithProgress(formData, onProgress)
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDateTime(dateValue) {
  const date = new Date(dateValue)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export default UploadPage
