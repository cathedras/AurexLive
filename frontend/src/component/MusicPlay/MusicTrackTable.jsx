import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Download, Headphones, LoaderCircle, Lock, LockOpen, MoreHorizontal, Pause, Pencil, Play, Plus, Printer, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useLanguage } from '../../context/languageContext'

function HeaderActionButton({ label, active = false, onClick, children }) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`header-icon-btn ${active ? 'header-icon-btn-active' : ''}`.trim()}
          onClick={onClick}
          aria-label={label}
        >
          <span className="header-icon-btn-graphic" aria-hidden="true">{children}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
          {label}
          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function RowActionButton({ label, tone = 'neutral', active = false, disabled = false, onClick, children }) {
  return (
    <Tooltip.Root delayDuration={120}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={`row-icon-btn row-icon-btn-${tone} ${active ? 'row-icon-btn-active' : ''}`.trim()}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          <span className="row-icon-btn-graphic" aria-hidden="true">{children}</span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
          {label}
          <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function PlaybackActionIcon({ playbackState }) {
  if (playbackState === 'playing') {
    return <Pause className="row-action-icon" strokeWidth={1.8} />
  }

  if (playbackState === 'stopping') {
    return <LoaderCircle className="row-action-icon row-action-icon-spinning" strokeWidth={1.8} />
  }

  return <Play className="row-action-icon" strokeWidth={1.8} />
}

function MusicTrackTable({
  currentShowName,
  hasCurrentShow,
  isPlaylistLocked,
  displayTracks,
  draggingId,
  onOpenCreateDialog,
  onTogglePlaylistLock,
  onCloseCurrentShow,
  onRefreshPageData,
  onPrintProgramSheet,
  onExportPdf,
  onSaveMusicList,
  onDragStart,
  onDropRow,
  onDragEnd,
  getTrackCreateTip,
  createTrackFromUpload,
  getTrackPlaybackTip,
  isTrackActive,
  toggleTrackPlayback,
  getTrackPlaybackState,
  getTrackPreviewTip,
  openPreviewPlayer,
  getTrackEditTip,
  openEditDialog,
  getTrackDeleteTip,
  onDeleteTrack,
}) {
  const { t } = useLanguage()

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="music-list-wrap">
        <div className="music-list-header">
          <div className="music-list-title">
            {t(`Music files (current show: ${currentShowName})`, `音乐文件列表（当前演出：${currentShowName}）`)}
            {hasCurrentShow && (
              <span className={`playlist-lock-badge ${isPlaylistLocked ? 'playlist-lock-badge-locked' : 'playlist-lock-badge-unlocked'}`}>
                {isPlaylistLocked ? t('Playlist locked', '节目单已锁定') : t('Playlist unlocked', '节目单未锁定')}
              </span>
            )}
          </div>
          <div className="music-list-actions">
            {!isPlaylistLocked && (
              <HeaderActionButton label={t('Add track', '新增节目')} onClick={onOpenCreateDialog}>
                <Plus className="header-action-icon" strokeWidth={1.8} />
              </HeaderActionButton>
            )}

            {hasCurrentShow && (
              <HeaderActionButton label={isPlaylistLocked ? t('Unlock playlist', '解除节目单锁定') : t('Lock playlist', '锁定节目单')} active={isPlaylistLocked} onClick={onTogglePlaylistLock}>
                {isPlaylistLocked
                  ? <LockOpen className="header-action-icon" strokeWidth={1.8} />
                  : <Lock className="header-action-icon" strokeWidth={1.8} />}
              </HeaderActionButton>
            )}

            <HeaderActionButton label={t('Refresh list', '刷新列表')} onClick={onRefreshPageData}>
              <RefreshCw className="header-action-icon" strokeWidth={1.8} />
            </HeaderActionButton>

            {!isPlaylistLocked && (
              <HeaderActionButton label={t('Save show', '保存演出')} onClick={onSaveMusicList}>
                <Save className="header-action-icon" strokeWidth={1.8} />
              </HeaderActionButton>
            )}

            {!isPlaylistLocked && hasCurrentShow && (
              <HeaderActionButton label={t('Close current show', '关闭当前演出')} onClick={onCloseCurrentShow}>
                <X className="header-action-icon" strokeWidth={1.8} />
              </HeaderActionButton>
            )}

            {isPlaylistLocked && (
              <DropdownMenu.Root>
                <Tooltip.Root delayDuration={150}>
                  <Tooltip.Trigger asChild>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        className="header-icon-btn"
                        aria-label={t('More actions', '更多操作')}
                      >
                        <span className="header-icon-btn-graphic" aria-hidden="true">
                          <MoreHorizontal className="header-action-icon" strokeWidth={1.8} />
                        </span>
                      </button>
                    </DropdownMenu.Trigger>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="music-toolbar-tooltip" side="top" sideOffset={10}>
                      {t('More actions', '更多操作')}
                      <Tooltip.Arrow className="music-toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="music-action-menu-panel" sideOffset={10} align="end">
                    <DropdownMenu.Item className="music-action-menu-item" onSelect={onPrintProgramSheet}>
                      <span className="music-action-menu-icon" aria-hidden="true">
                        <Printer size={16} strokeWidth={1.8} />
                      </span>
                      <span>{t('Print setlist', '打印节目单')}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="music-action-menu-item" onSelect={onExportPdf}>
                      <span className="music-action-menu-icon" aria-hidden="true">
                        <Download size={16} strokeWidth={1.8} />
                      </span>
                      <span>{t('Export PDF', '导出 PDF')}</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      <table className="music-table">
        <thead>
          <tr>
            <th>{t('No.', '序号')}</th>
            <th>{t('Performer', '演出人')}</th>
            <th>{t('Track name', '节目名')}</th>
            <th>{t('Host script', '主持人口播词')}</th>
            <th>{t('Audio file', '音乐文件名')}</th>
            <th>{t('Actions', '操作')}</th>
          </tr>
        </thead>
        <tbody>
          {displayTracks.map((track, index) => (
            <tr
              key={track.id}
              draggable={!track.isTemporary}
              onDragStart={() => onDragStart(track.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropRow(track.id)}
              onDragEnd={onDragEnd}
              className={`${draggingId === track.id ? 'dragging-row' : ''} ${track.isTemporary ? 'temporary-track-row' : ''}`.trim()}
            >
              <td>{index + 1}</td>
              <td>{track.performer || (track.isTemporary ? t('To be filled', '待填写') : '-')}</td>
              <td>
                <div className="music-program-cell">
                  <span>{track.programName || (track.isTemporary ? t('To be added', '待新增节目') : '-')}</span>
                  {track.isTemporary && <span className="temporary-track-tag">{t('Temp', '临时')}</span>}
                </div>
              </td>
              <td className="music-host-script" title={track.hostScript}>
                {track.hostScript || (track.isTemporary ? t('This newly uploaded file has not been added to the formal playlist yet.', '新上传文件，尚未加入正式节目单。') : '-')}
              </td>
              <td className="music-file-name" title={track.fileName}>{track.fileName}</td>
              <td className="music-action-cell">
                <div className="music-action-buttons">
                  {track.isTemporary ? (
                    <>
                      {!isPlaylistLocked && (
                        <RowActionButton
                          label={getTrackPreviewTip(track)}
                          tone="preview"
                          onClick={() => openPreviewPlayer(track)}
                          disabled={!track.savedName}
                        >
                          <Headphones className="row-action-icon" strokeWidth={1.8} />
                        </RowActionButton>
                      )}
                      <RowActionButton label={getTrackCreateTip(track)} tone="create" onClick={() => createTrackFromUpload(track)}>
                        <Plus className="row-action-icon" strokeWidth={1.8} />
                      </RowActionButton>
                    </>
                  ) : (
                    <>
                      {isPlaylistLocked && (
                        <RowActionButton
                          label={getTrackPlaybackTip(track)}
                          tone="play"
                          active={isTrackActive(track)}
                          onClick={() => toggleTrackPlayback(track)}
                          disabled={!track.savedName || getTrackPlaybackState(track) === 'stopping'}
                        >
                          <PlaybackActionIcon playbackState={getTrackPlaybackState(track)} />
                        </RowActionButton>
                      )}
                      {!isPlaylistLocked && (
                        <RowActionButton
                          label={getTrackPreviewTip(track)}
                          tone="preview"
                          onClick={() => openPreviewPlayer(track)}
                          disabled={!track.savedName}
                        >
                          <Headphones className="row-action-icon" strokeWidth={1.8} />
                        </RowActionButton>
                      )}
                      {!isPlaylistLocked && (
                        <RowActionButton label={getTrackEditTip(track)} tone="edit" onClick={() => openEditDialog(track)}>
                          <Pencil className="row-action-icon" strokeWidth={1.8} />
                        </RowActionButton>
                      )}
                      {!isPlaylistLocked && (
                        <RowActionButton label={getTrackDeleteTip(track)} tone="delete" onClick={() => onDeleteTrack(track.id)}>
                          <Trash2 className="row-action-icon" strokeWidth={1.8} />
                        </RowActionButton>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Tooltip.Provider>
  )
}

export default MusicTrackTable