import { useCallback, useState } from 'react'
import { buildEditedTrackList, buildMusicListSavePayload, downloadBlobFile } from '../../services/musicPlay'
import { getRequestErrorMessage } from '../../utils/http'

export function useMusicEditorState({
  tracks,
  currentTrackId,
  currentShowName,
  isPlaylistLocked,
  musicPageApi,
  refreshPageData,
  setTracks,
  setCurrentTrackId,
  setMessage,
}) {
  const [dialogMode, setDialogMode] = useState('edit')
  const [editingTrack, setEditingTrack] = useState(null)
  const [editPerformer, setEditPerformer] = useState('')
  const [editProgramName, setEditProgramName] = useState('')
  const [editHostScript, setEditHostScript] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveRecordName, setSaveRecordName] = useState('')
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFileName, setExportFileName] = useState('节目单')
  const [deletingTrack, setDeletingTrack] = useState(null)

  const saveCurrentMusicList = useCallback(async (nextTracks) => {
    const payload = buildMusicListSavePayload('musiclist', nextTracks, false, isPlaylistLocked)

    const result = await musicPageApi.saveMusicList(payload)
    if (!result.success) {
      throw new Error(result.message || '保存失败')
    }
  }, [isPlaylistLocked, musicPageApi])

  const openEditDialog = useCallback((track) => {
    setDialogMode('edit')
    setEditingTrack(track)
    setEditPerformer(track.performer || '')
    setEditProgramName(track.programName || '')
    setEditHostScript(track.hostScript || '')
    setAiSuggestions([])
  }, [])

  const openCreateDialog = useCallback((sourceTrack = null) => {
    const sourceTrackStatus = String(sourceTrack?.status || (sourceTrack?.isTemporary ? 'temp' : 'saved')).trim()
    const shouldPrefillFromSource = sourceTrackStatus === 'saved'

    setDialogMode('create')
    setEditingTrack({
      id: '',
      fileName: sourceTrack?.fileName || '',
      savedName: sourceTrack?.savedName || '',
      fileHash: sourceTrack?.fileHash || '',
      isTemporary: Boolean(sourceTrack?.isTemporary),
    })
    setEditPerformer(shouldPrefillFromSource ? (sourceTrack?.performer || '') : '')
    setEditProgramName(shouldPrefillFromSource ? (sourceTrack?.programName || '') : '')
    setEditHostScript('')
    setAiSuggestions([])
  }, [])

  const createTrackFromUpload = useCallback((track) => {
    openCreateDialog(track)
    setMessage(`已选择文件：${track.fileName}，请填写节目名称和演出人后保存。`)
  }, [openCreateDialog, setMessage])

  const resetEditDialog = useCallback(() => {
    setEditingTrack(null)
    setEditPerformer('')
    setEditProgramName('')
    setEditHostScript('')
    setAiSuggestions([])
  }, [])

  const onDeleteTrack = useCallback((trackId) => {
    const target = tracks.find((item) => item.id === trackId)
    if (!target) return
    setDeletingTrack(target)
  }, [tracks])

  const closeDeleteDialog = useCallback(() => {
    setDeletingTrack(null)
  }, [])

  const confirmDeleteTrack = useCallback(async () => {
    if (!deletingTrack) return
    const trackId = deletingTrack.id

    const nextTracks = tracks.filter((item) => item.id !== trackId)

    try {
      await saveCurrentMusicList(nextTracks)
      setTracks(nextTracks)
      if (currentTrackId === trackId) {
        setCurrentTrackId(null)
      }
      setMessage('删除并保存成功')
      closeDeleteDialog()
    } catch (error) {
      setMessage(`删除失败：${error.message}`)
    }
  }, [closeDeleteDialog, currentTrackId, deletingTrack, saveCurrentMusicList, setCurrentTrackId, setMessage, setTracks, tracks])

  const onGenerateHostScript = useCallback(async () => {
    const performer = editPerformer.trim()
    const programName = editProgramName.trim()

    if (!performer || !programName) {
      setMessage('请先填写演出人和节目名，再生成口播词')
      return
    }

    try {
      setIsGeneratingScript(true)
      setAiSuggestions([])

      const result = await musicPageApi.generateHostScriptSuggestions({ performer, programName, count: 3 })
      if (!result.success) {
        throw new Error(result.message || '生成失败')
      }

      setAiSuggestions(Array.isArray(result.suggestions) ? result.suggestions : [])
      setMessage('已生成口播词候选，可点击下方示例直接填入')
    } catch (error) {
      setMessage(`生成口播词失败：${error.message}`)
    } finally {
      setIsGeneratingScript(false)
    }
  }, [editPerformer, editProgramName, musicPageApi, setMessage])

  const onSelectSuggestion = useCallback((text) => {
    setEditHostScript(text)
  }, [])

  const onConfirmEdit = useCallback(async () => {
    if (!editingTrack) return

    const performer = editPerformer.trim()
    const programName = editProgramName.trim()

    if (!performer || !programName) {
      setMessage('演出人和节目名不能为空')
      return
    }

    const hostScript = editHostScript.trim()

    try {
      if (dialogMode === 'create') {
        const result = await musicPageApi.createRuntimeTrack({
          performer,
          programName,
          hostScript,
          sourceTrack: {
            fileName: editingTrack?.fileName || '',
            savedName: editingTrack?.savedName || '',
            fileHash: editingTrack?.fileHash || '',
          },
        })

        if (!result.success) {
          throw new Error(result.message || '新增失败')
        }

        await refreshPageData()
      } else {
        const nextTracks = buildEditedTrackList({ tracks, dialogMode, editingTrack, performer, programName, hostScript })
        await saveCurrentMusicList(nextTracks)
        setTracks(nextTracks)
      }
      setMessage(dialogMode === 'create' ? '新增并保存成功' : '修改并保存成功')
      resetEditDialog()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    }
  }, [dialogMode, editHostScript, editPerformer, editProgramName, editingTrack, musicPageApi, refreshPageData, resetEditDialog, saveCurrentMusicList, setMessage, setTracks, tracks])

  const onSaveMusicList = useCallback(() => {
    // 如果当前已打开演出且名称有效，则自动填入；否则清空
    const defaultName = (currentShowName && currentShowName !== '未设置') ? currentShowName : '';
    setSaveRecordName(defaultName);
    setSaveDialogOpen(true);
  }, [currentShowName]);

  const closeSaveDialog = useCallback(() => {
    setSaveDialogOpen(false)
    setSaveRecordName('')
  }, [])

  const confirmSaveMusicList = useCallback(async () => {
    const trimmedName = saveRecordName.trim()
    if (!trimmedName) {
      setMessage('保存失败：演出名称不能为空')
      return
    }

    try {
      // 如果打开了一个演出 (currentShowName 存在且有效)
      const isShowOpened = currentShowName && currentShowName !== '未设置'
      
      let tracksToSave = tracks

      if (isShowOpened) {
        // 需求：直接把所有正式节目重新生成
        // 过滤出所有 status 为 'saved' 的正式节目
        const officialTracks = tracks.filter(track => track.status === 'saved')
        
        // 如果没有任何正式节目，提示用户或阻止操作（视业务逻辑而定，此处暂按空列表处理或保留原逻辑）
        if (officialTracks.length === 0) {
           setMessage('当前演出暂无正式节目，无法执行重新生成存储操作')
           return
        }
        
        tracksToSave = officialTracks
        setMessage('正在重新生成并存储正式节目列表...')
      }

      const payload = buildMusicListSavePayload(trimmedName, tracksToSave, true, isPlaylistLocked)
      const result = await musicPageApi.saveMusicList(payload)

      if (!result.success) {
        throw new Error(result.message || '保存失败')
      }

      setMessage(`已${isShowOpened ? '重新生成并' : ''}保存设为当前演出：${result.currentShow?.recordName || trimmedName}`)
      await refreshPageData()
      closeSaveDialog()
    } catch (error) {
      setMessage(`保存失败：${error.message}`)
    }
  }, [closeSaveDialog, currentShowName, isPlaylistLocked, musicPageApi, refreshPageData, saveRecordName, setMessage, tracks])

  const onExportPdf = useCallback(() => {
    const defaultName = currentShowName && currentShowName !== '未设置' ? currentShowName : '节目单'
    setExportFileName(defaultName)
    setExportDialogOpen(true)
  }, [currentShowName])

  const closeExportDialog = useCallback(() => {
    setExportDialogOpen(false)
    setExportFileName('节目单')
  }, [])

  const confirmExportProgramSheetPdf = useCallback(async () => {
    try {
      const recordName = exportFileName.trim() || '节目单'
      const blob = await musicPageApi.exportProgramSheetPdf({
        recordName,
        musicList: buildMusicListSavePayload(recordName, tracks, false, isPlaylistLocked).musicList,
      })

      const downloadedName = `${recordName}.pdf`
      downloadBlobFile(blob, downloadedName)

      setMessage(`PDF 导出成功：${downloadedName}`)
      closeExportDialog()
    } catch (error) {
      setMessage(`导出 PDF 失败：${getRequestErrorMessage(error, '请求失败')}`)
    }
  }, [closeExportDialog, exportFileName, isPlaylistLocked, musicPageApi, setMessage, tracks])

  const getFieldValue = useCallback((field) => {
    if (field === 'performer') return editPerformer
    if (field === 'program') return editProgramName
    return editHostScript
  }, [editHostScript, editPerformer, editProgramName])

  const setFieldValue = useCallback((field, value) => {
    if (field === 'performer') {
      setEditPerformer(value)
      return
    }
    if (field === 'program') {
      setEditProgramName(value)
      return
    }
    setEditHostScript(value)
  }, [])

  return {
    dialogMode,
    editingTrack,
    editPerformer,
    editProgramName,
    editHostScript,
    aiSuggestions,
    isGeneratingScript,
    saveDialogOpen,
    saveRecordName,
    exportDialogOpen,
    exportFileName,
    deletingTrack,
    setEditPerformer,
    setEditProgramName,
    setEditHostScript,
    setSaveRecordName,
    setExportFileName,
    getFieldValue,
    setFieldValue,
    openEditDialog,
    openCreateDialog,
    createTrackFromUpload,
    resetEditDialog,
    onDeleteTrack,
    closeDeleteDialog,
    confirmDeleteTrack,
    onGenerateHostScript,
    onSelectSuggestion,
    onConfirmEdit,
    onSaveMusicList,
    closeSaveDialog,
    confirmSaveMusicList,
    onExportPdf,
    closeExportDialog,
    confirmExportProgramSheetPdf,
  }
}