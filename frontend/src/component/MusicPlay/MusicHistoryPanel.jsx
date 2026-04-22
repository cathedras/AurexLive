import { useLanguage } from '../../context/languageContext'

function MusicHistoryPanel({ historyShows, onSwitchToHistoryShow, onDeleteHistoryShow }) {
  const { t } = useLanguage()

  return (
    <div className="music-list-wrap history-wrap">
      <div className="music-list-header">
        <div className="music-list-title">{t('History shows (double-click to load and set as current show).', '历史演出文件（双击加载并设为当前演出）')}</div>
      </div>
      <ul className="history-show-list">
        {historyShows.length === 0 ? (
          <li className="empty-text">{t('No history shows yet.', '暂无历史演出文件')}</li>
        ) : historyShows.map((item) => (
          <li
            key={item.fileName}
            className="history-show-item"
          >
            <button
              type="button"
              className="history-show-main"
              onDoubleClick={() => onSwitchToHistoryShow(item.fileName)}
              title={t('Double-click to switch to this show.', '双击切换到该演出')}
            >
              <span className="history-show-name">{item.recordName}</span>
              <span className="history-show-meta">{t(`${item.count} tracks`, `${item.count} 个节目`)}</span>
            </button>
            <button
              type="button"
              className="history-show-delete"
              onClick={() => onDeleteHistoryShow(item.fileName)}
              title={t(`Delete history show ${item.recordName}`, `删除历史演出 ${item.recordName}`)}
            >
              {t('Delete', '删除')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MusicHistoryPanel