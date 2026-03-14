import Modal from '../Modal'

function ExportPdfDialog({ open, exportFileName, onClose, onChange, onConfirm }) {
  return (
    <Modal
      open={open}
      title="导出 PDF"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>导出</button>
        </>
      )}
    >
      <div className="dialog-field">
        <label className="dialog-label">文件名称</label>
        <input
          className="dialog-input"
          value={exportFileName}
          onChange={(event) => onChange(event.target.value)}
          placeholder="请输入文件名（无需 .pdf 后缀）"
        />
      </div>
    </Modal>
  )
}

export default ExportPdfDialog