function MusicMarqueePanel({ marqueeSpeedSec, currentShowName, currentProgramName, currentPerformerName }) {
  return (
    <div className="playing-marquee-panel" style={{ '--music-marquee-speed': `${marqueeSpeedSec}s` }}>
      <div className="playing-marquee-row" aria-label="当前演出标题滚动显示">
        <div className="playing-marquee-track">
          <span>{`当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`}</span>
          <span>{`当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`}</span>
        </div>
      </div>
      <div className="playing-marquee-row" aria-label="当前演出人员滚动显示">
        <div className="playing-marquee-track">
          <span>{`当前演出人员：${currentPerformerName}`}</span>
          <span>{`当前演出人员：${currentPerformerName}`}</span>
        </div>
      </div>
    </div>
  )
}

export default MusicMarqueePanel