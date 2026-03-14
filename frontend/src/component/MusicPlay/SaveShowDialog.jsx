import Modal from '../Modal'

function SaveShowDialog({ open, saveRecordName, onClose, onChange, onConfirm }) {
  return (
    <Modal
      open={open}
      title="保存演出"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>保存并设为当前演出</button>
        </>
      )}
    >
      <div className="dialog-field dialog-field-compact">
        <input
          className="dialog-input dialog-input-full"
          value={saveRecordName}
          onChange={(event) => onChange(event.target.value)}
          placeholder="请输入演出名称（无需 .json 后缀）"
        />
      </div>
    </Modal>
  )
}

export default SaveShowDialog