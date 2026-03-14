function MusicTrackTable({
  currentShowName,
  isPlaylistLocked,
  displayTracks,
  draggingId,
  onOpenCreateDialog,
  onTogglePlaylistLock,
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
  getTrackPlaybackButtonLabel,
  getTrackPreviewTip,
  openPreviewPlayer,
  getTrackEditTip,
  openEditDialog,
  getTrackDeleteTip,
  onDeleteTrack,
}) {
  return (
    <div className="music-list-wrap">
      <div className="music-list-header">
        <div className="music-list-title">
          音乐文件列表（当前演出：{currentShowName}）
          <span className={`playlist-lock-badge ${isPlaylistLocked ? 'playlist-lock-badge-locked' : 'playlist-lock-badge-unlocked'}`}>
            {isPlaylistLocked ? '节目单已锁定' : '节目单未锁定'}
          </span>
        </div>
        <div className="music-list-actions">
          <button type="button" className="refresh-btn" onClick={onOpenCreateDialog}>新增节目</button>
          <button type="button" className={`refresh-btn ${isPlaylistLocked ? 'refresh-btn-active' : ''}`} onClick={onTogglePlaylistLock}>
            {isPlaylistLocked ? '解除锁定' : '锁定节目单'}
          </button>
          <button type="button" className="refresh-btn" onClick={onRefreshPageData}>刷新列表</button>
          <button type="button" className="refresh-btn" onClick={onPrintProgramSheet}>打印节目单</button>
          <button type="button" className="refresh-btn" onClick={onExportPdf}>导出 PDF</button>
          <button type="button" className="refresh-btn" onClick={onSaveMusicList}>保存演出</button>
        </div>
      </div>
      <table className="music-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>演出人</th>
            <th>节目名</th>
            <th>主持人口播词</th>
            <th>音乐文件名</th>
            <th>操作</th>
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
              <td>{track.performer || (track.isTemporary ? '待填写' : '-')}</td>
              <td>
                <div className="music-program-cell">
                  <span>{track.programName || (track.isTemporary ? '待新增节目' : '-')}</span>
                  {track.isTemporary && <span className="temporary-track-tag">临时</span>}
                </div>
              </td>
              <td className="music-host-script" title={track.hostScript}>
                {track.hostScript || (track.isTemporary ? '新上传文件，尚未加入正式节目单。' : '-')}
              </td>
              <td className="music-file-name" title={track.fileName}>{track.fileName}</td>
              <td className="music-action-cell">
                <div className="music-action-buttons">
                  {track.isTemporary ? (
                    <span className="action-tip-wrap" data-tip={getTrackCreateTip(track)}>
                      <button className="row-add-btn" onClick={() => createTrackFromUpload(track)} type="button">
                        新增节目
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="action-tip-wrap" data-tip={getTrackPlaybackTip(track)}>
                        <button
                          className={`row-play-btn ${isTrackActive(track) ? 'row-play-btn-active' : ''}`}
                          onClick={() => toggleTrackPlayback(track)}
                          type="button"
                          disabled={!track.savedName || getTrackPlaybackState(track) === 'stopping'}
                        >
                          <span
                            className={`row-play-status row-play-status-${getTrackPlaybackState(track)}`}
                            aria-hidden="true"
                          />
                          <span>{getTrackPlaybackButtonLabel(track)}</span>
                        </button>
                      </span>
                      <span className="action-tip-wrap" data-tip={getTrackPreviewTip(track)}>
                        <button
                          className="row-preview-btn"
                          onClick={() => openPreviewPlayer(track)}
                          type="button"
                          disabled={!track.savedName}
                        >
                          预听
                        </button>
                      </span>
                      <span className="action-tip-wrap" data-tip={getTrackEditTip(track)}>
                        <button className="row-edit-btn" onClick={() => openEditDialog(track)} type="button">
                          修改
                        </button>
                      </span>
                      <span className="action-tip-wrap" data-tip={getTrackDeleteTip(track)}>
                        <button className="row-delete-btn" onClick={() => onDeleteTrack(track.id)} type="button">
                          删除
                        </button>
                      </span>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MusicTrackTable