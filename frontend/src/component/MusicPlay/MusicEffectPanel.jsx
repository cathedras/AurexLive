function MusicEffectPanel({ customEffectName, onCustomEffectNameChange, onTriggerLocalEffect, onTriggerCustomEffect }) {
  return (
    <div className="music-list-wrap effect-wrap">
      <div className="music-list-header">
        <div className="music-list-title">节目效果快捷按钮（电脑端）</div>
      </div>
      <div className="effect-buttons">
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('大笑')}>大笑</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('拍手')}>拍手</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('欢呼')}>欢呼</button>
        <button type="button" className="refresh-btn" onClick={() => onTriggerLocalEffect('鼓点')}>鼓点</button>
        <input
          className="effect-input"
          value={customEffectName}
          onChange={(event) => onCustomEffectNameChange(event.target.value)}
          placeholder="自定义效果名"
        />
        <button type="button" className="refresh-btn" onClick={onTriggerCustomEffect}>触发自定义</button>
      </div>
    </div>
  )
}

export default MusicEffectPanel