import { useLanguage } from '../../context/languageContext'
import Modal from '../Modal'

function DeleteTrackDialog({ deletingTrack, onClose, onConfirm }) {
  const { t } = useLanguage()

  return (
    <Modal
      open={!!deletingTrack}
      title={t('Confirm delete', '删除确认')}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>{t('Cancel', '取消')}</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>{t('Delete', '确认删除')}</button>
        </>
      )}
    >
      <div className="dialog-field">
        <div className="dialog-desc">
          {deletingTrack
            ? t(`Delete "${deletingTrack.performer} - ${deletingTrack.programName}"?`, `确认删除节目「${deletingTrack.performer} - ${deletingTrack.programName}」吗？`)
            : t('Delete this track?', '确认删除该节目吗？')}
        </div>
      </div>
    </Modal>
  )
}

export default DeleteTrackDialog