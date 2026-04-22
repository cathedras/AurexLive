import { useLanguage } from '../../context/languageContext'

function MusicEffectPanel({ customEffectName, onCustomEffectNameChange, onTriggerLocalEffect, onTriggerCustomEffect }) {
  const { t } = useLanguage()

  return (
    <div className="music-list-wrap effect-wrap">
      <div className="music-list-header">
        <div className="music-list-title">{t('Quick effect buttons for the desktop client.', '节目效果快捷按钮（电脑端）')}</div>
      </div>
      <div className="effect-buttons">
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('大笑')}>{t('Laugh', '大笑')}</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('拍手')}>{t('Clap', '拍手')}</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('欢呼')}>{t('Cheer', '欢呼')}</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('鼓点')}>{t('Drum roll', '鼓点')}</button>
        <input
          className="effect-input"
          value={customEffectName}
          onChange={(event) => onCustomEffectNameChange(event.target.value)}
          placeholder={t('Custom effect name', '自定义效果名')}
        />
        <button type="button" className="refresh-btn" onClick={onTriggerCustomEffect}>{t('Trigger custom effect', '触发自定义')}</button>
      </div>
    </div>
  )
}

export default MusicEffectPanel