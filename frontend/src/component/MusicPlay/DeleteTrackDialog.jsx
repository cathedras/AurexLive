import Modal from '../Modal'

function DeleteTrackDialog({ deletingTrack, onClose, onConfirm }) {
  return (
    <Modal
      open={!!deletingTrack}
      title="删除确认"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>确认删除</button>
        </>
      )}
    >
      <div className="dialog-field">
        <div className="dialog-desc">
          {deletingTrack
            ? `确认删除节目「${deletingTrack.performer} - ${deletingTrack.programName}」吗？`
            : '确认删除该节目吗？'}
        </div>
      </div>
    </Modal>
  )
}

export default DeleteTrackDialog