function Modal({ open, title, onClose, children, footer }) {
  if (!open) {
    return null
  }

  const onMaskClick = () => {
    onClose?.()
  }

  const onPanelClick = (event) => {
    event.stopPropagation()
  }

  return (
    <div className="dialog-mask" onClick={onMaskClick}>
      <div className="dialog-panel" onClick={onPanelClick}>
        {title ? <h3 className="dialog-title">{title}</h3> : null}
        {children}
        {footer ? <div className="dialog-actions">{footer}</div> : null}
      </div>
    </div>
  )
}

export default Modal
