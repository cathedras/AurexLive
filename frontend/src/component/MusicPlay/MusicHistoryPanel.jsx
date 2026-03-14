function MusicHistoryPanel({ historyShows, onSwitchToHistoryShow }) {
  return (
    <div className="music-list-wrap history-wrap">
      <div className="music-list-header">
        <div className="music-list-title">历史演出文件（双击加载并设为当前演出）</div>
      </div>
      <ul className="history-show-list">
        {historyShows.length === 0 ? (
          <li className="empty-text">暂无历史演出文件</li>
        ) : historyShows.map((item) => (
          <li
            key={item.fileName}
            className="history-show-item"
            onDoubleClick={() => onSwitchToHistoryShow(item.fileName)}
            title="双击切换到该演出"
          >
            <span className="history-show-name">{item.recordName}</span>
            <span className="history-show-meta">{item.count} 个节目</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MusicHistoryPanel