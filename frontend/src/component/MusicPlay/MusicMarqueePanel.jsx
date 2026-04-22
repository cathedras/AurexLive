import { useLanguage } from '../../context/languageContext'

function MusicMarqueePanel({ marqueeSpeedSec, currentShowName, currentProgramName, currentPerformerName }) {
  const { t } = useLanguage()

  return (
    <div className="playing-marquee-panel" style={{ '--music-marquee-speed': `${marqueeSpeedSec}s` }}>
      <div className="playing-marquee-row" aria-label={t('Current show title marquee', '当前演出标题滚动显示')}>
        <div className="playing-marquee-track">
          <span>{t(`Current show title: ${currentShowName} · Current track: ${currentProgramName}`, `当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`)}</span>
          <span>{t(`Current show title: ${currentShowName} · Current track: ${currentProgramName}`, `当前演出标题：${currentShowName} · 当前节目：${currentProgramName}`)}</span>
        </div>
      </div>
      <div className="playing-marquee-row" aria-label={t('Current performer marquee', '当前演出人员滚动显示')}>
        <div className="playing-marquee-track">
          <span>{t(`Current performer: ${currentPerformerName}`, `当前演出人员：${currentPerformerName}`)}</span>
          <span>{t(`Current performer: ${currentPerformerName}`, `当前演出人员：${currentPerformerName}`)}</span>
        </div>
      </div>
    </div>
  )
}

export default MusicMarqueePanel