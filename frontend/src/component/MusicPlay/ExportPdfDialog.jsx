import { useLanguage } from '../../context/languageContext'
import Modal from '../Modal'

function ExportPdfDialog({ open, exportFileName, onClose, onChange, onConfirm }) {
  const { t } = useLanguage()

  return (
    <Modal
      open={open}
      title={t('Export PDF', '导出 PDF')}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>{t('Cancel', '取消')}</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>{t('Export', '导出')}</button>
        </>
      )}
    >
      <div className="dialog-field">
        <label className="dialog-label">{t('File name', '文件名称')}</label>
        <input
          className="dialog-input"
          value={exportFileName}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('Enter a file name (no .pdf suffix needed)', '请输入文件名（无需 .pdf 后缀）')}
        />
      </div>
    </Modal>
  )
}

export default ExportPdfDialog