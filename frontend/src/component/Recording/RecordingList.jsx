import { Copy, Headphones, Trash2 } from 'lucide-react'
import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'

import Modal from '../Modal'
import { deleteRecording, recordingUse } from '../../services/musicPlay'

function RecordingList({ recordings, t, formatRecordingFileSize, onRefresh, onPreview, setStatusMessage }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [useDialogOpen, setUseDialogOpen] = useState(false)
  const [useTarget, setUseTarget] = useState(null)
  const [useNewName, setUseNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshRecordings = async () => {
    try {
      await onRefresh?.()
    } catch (error) {
      console.error('Failed to refresh recordings:', error)
    }
  }

  const deleteRecordingItem = async (filename) => {
    try {
      const result = await deleteRecording(filename)
      if (result.success) {
        await refreshRecordings()
      } else {
        setStatusMessage?.('error', t(`Failed to delete recording: ${result.message}`, '删除录音失败: ' + result.message))
      }
    } catch (error) {
      setStatusMessage?.('error', t(`Failed to delete recording: ${error.message}`, `删除录音失败: ${error.message}`))
    }
  }

  const confirmDeleteRecording = (filename) => {
    setDeleteTarget(filename)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteDialogOpen(false)
    setBusy(true)
    try {
      await deleteRecordingItem(deleteTarget)
    } finally {
      setBusy(false)
      setDeleteTarget(null)
    }
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }

  const clearAllRecordings = async () => {
    try {
      setBusy(true)
      const names = recordings.map((recording) => recording.filename).filter(Boolean)
      await Promise.all(names.map((name) => deleteRecording(name).catch(() => null)))
      await refreshRecordings()
    } catch (error) {
      setStatusMessage?.('error', t(`Failed to clear recordings: ${(error && error.message) ? error.message : error}`, `清空录音失败: ${(error && error.message) ? error.message : error}`))
    } finally {
      setBusy(false)
    }
  }

  const openUseRecordingDialog = (filename) => {
    const defaultName = String(filename || '').replace(/^\d+-\d+-/, '')
    setUseTarget(filename)
    setUseNewName(defaultName)
    setUseDialogOpen(true)
  }

  const handleConfirmUse = async () => {
    if (!useTarget) return
    setUseDialogOpen(false)
    setBusy(true)
    try {
      await recordingUse(useTarget, useNewName)
      await refreshRecordings()
    } catch (error) {
      setStatusMessage?.('error', t(`Failed to use recording: ${(error && error.message) ? error.message : error}`, `使用录音失败: ${(error && error.message) ? error.message : error}`))
    } finally {
      setBusy(false)
      setUseTarget(null)
    }
  }

  const handleCancelUse = () => {
    setUseDialogOpen(false)
    setUseTarget(null)
  }

  return (
    <>
      <div className="recording-list-card home-panel">
        <h4 className="recording-list-title">{t('Recordings', '录音列表')}</h4>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14 }} />
          <div>
            <Tooltip.Root delayDuration={120}>
              <Tooltip.Trigger asChild>
                <button
                  className="row-icon-btn row-icon-btn-delete"
                  onClick={clearAllRecordings}
                  disabled={busy || !recordings || recordings.length === 0}
                  aria-label={t('Clear recordings', '清空录音')}
                >
                  <span className="row-icon-btn-graphic" aria-hidden>
                    <Trash2 className="row-action-icon" />
                  </span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                  {t('Clear recordings', '清空录音')}
                  <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>
        <div className="recording-list-ul">
          {recordings.map((rec, index) => (
            <div key={index} className="recording-item-card">
              <div className="recording-info">
                <span className="recording-name">{rec.filename}</span>
                <span className="recording-date">{new Date(rec.createdAt).toLocaleString()}</span>
                <span className="recording-size">{t('Size:', '大小:')} {formatRecordingFileSize(rec.size)}</span>
              </div>
              <div className="recording-actions">
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button className="row-icon-btn row-icon-btn-use" onClick={() => openUseRecordingDialog(rec.filename)} aria-label={t(`Use ${rec.filename}`, `使用 ${rec.filename}`)}>
                      <span className="row-icon-btn-graphic" aria-hidden>
                        <Copy className="row-action-icon" />
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {t(`Use ${rec.filename}`, `使用 ${rec.filename}`)}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button className="row-icon-btn row-icon-btn-preview" onClick={() => onPreview(rec)} aria-label={t(`Preview ${rec.filename}`, `试听 ${rec.filename}`)}>
                      <span className="row-icon-btn-graphic" aria-hidden>
                        <Headphones className="row-action-icon" />
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {t(`Preview ${rec.filename}`, `试听 ${rec.filename}`)}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root delayDuration={120}>
                  <Tooltip.Trigger asChild>
                    <button className="row-icon-btn row-icon-btn-delete" onClick={() => confirmDeleteRecording(rec.filename)} aria-label={t(`Delete ${rec.filename}`, `删除 ${rec.filename}`)}>
                      <span className="row-icon-btn-graphic" aria-hidden>
                        <Trash2 className="row-action-icon" />
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {t(`Delete ${rec.filename}`, `删除 ${rec.filename}`)}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal open={deleteDialogOpen} title={t('Confirm delete', '确认删除')} onClose={handleCancelDelete} footer={
        <>
          <button className="row-icon-btn" onClick={handleCancelDelete}>{t('Cancel', '取消')}</button>
          <button className="row-icon-btn row-icon-btn-delete" onClick={handleConfirmDelete}>{t('Delete', '删除')}</button>
        </>
      }>
        <p>{t('Delete this recording? This action cannot be undone.', '确认删除该录音吗？此操作不可恢复。')}</p>
      </Modal>

      <Modal open={useDialogOpen} title={t('Use and rename recording', '使用并重命名录音')} onClose={handleCancelUse} footer={
        <>
          <button className="row-icon-btn" onClick={handleCancelUse}>{t('Cancel', '取消')}</button>
          <button className="row-icon-btn" onClick={handleConfirmUse}>{t('Confirm', '确定')}</button>
        </>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>{t('Rename to:', '重命名为：')}</label>
          <input value={useNewName} onChange={(e) => setUseNewName(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

export default RecordingList
