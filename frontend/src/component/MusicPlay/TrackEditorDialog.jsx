import { useLanguage } from '../../context/languageContext'
import Modal from '../Modal'

function TrackEditorDialog({
  open,
  dialogMode,
  onClose,
  onConfirm,
  speechInputMode,
  onSpeechInputModeChange,
  listeningField,
  showModelHintEnabled,
  speechSupported,
  speechSupportHint,
  performerInputRef,
  editPerformer,
  onEditPerformerChange,
  onKeyboardInput,
  onSpeechInput,
  programInputRef,
  editProgramName,
  onEditProgramNameChange,
  hostScriptInputRef,
  editHostScript,
  onEditHostScriptChange,
  onGenerateHostScript,
  isGeneratingScript,
  aiSuggestions,
  onSelectSuggestion,
}) {
  const { t } = useLanguage()

  return (
    <Modal
      open={open}
      title={dialogMode === 'create' ? t('Add track', '新增节目') : t('Edit show details', '修改演出信息')}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="dialog-btn dialog-btn-secondary" onClick={onClose}>{t('Cancel', '取消')}</button>
          <button type="button" className="dialog-btn" onClick={onConfirm}>{dialogMode === 'create' ? t('Add and save', '新增并保存') : t('Save', '保存')}</button>
        </>
      )}
    >
      <div className="dialog-field">
        <label className="dialog-label">{t('Speech recognition mode', '语音识别模式')}</label>
        <select
          className="dialog-select"
          value={speechInputMode}
          onChange={(event) => onSpeechInputModeChange(event.target.value)}
          disabled={!!listeningField}
        >
          <option value="ai">{t('AI recognition (online first)', 'AI 识别（在线优先）')}</option>
          <option value="local">{t('Local recognition', '本机识别')}</option>
        </select>
        <div className="dialog-tip">{t('AI mode optimizes text when online and automatically falls back to local recognition offline.', 'AI 模式会在联网时进行文本优化，无网络时自动回退为本机识别。')}</div>
        {showModelHintEnabled && speechInputMode === 'ai' && (
          <div className="dialog-tip">{t('Current mode: AI recognition + live text optimization', '当前模式：AI 识别 + 实时文本优化')}</div>
        )}
        <div className={`dialog-tip ${speechSupported ? '' : 'dialog-tip-warning'}`}>{speechSupportHint}</div>
      </div>

      <div className="dialog-field">
        <label className="dialog-label">{t('Performer', '演出人')}</label>
        <div className="dialog-input-row">
          <input
            ref={performerInputRef}
            className="dialog-input"
            value={editPerformer}
            onChange={(event) => onEditPerformerChange(event.target.value)}
            placeholder={t('Enter performer name', '请输入演出人姓名')}
          />
          <button type="button" className="input-tool-btn" onClick={() => onKeyboardInput('performer')}>{t('Keyboard', '键盘')}</button>
          <button
            type="button"
            className={`input-tool-btn ${listeningField === 'performer' ? 'input-tool-btn-active' : ''}`}
            onClick={() => onSpeechInput('performer')}
            disabled={!speechSupported || (!!listeningField && listeningField !== 'performer')}
          >
            {listeningField === 'performer' ? t('Listening...', '识别中...') : t('Speech to text', '语音转文字')}
          </button>
        </div>
      </div>

      <div className="dialog-field">
        <label className="dialog-label">{t('Track name', '节目名')}</label>
        <div className="dialog-input-row">
          <input
            ref={programInputRef}
            className="dialog-input"
            value={editProgramName}
            onChange={(event) => onEditProgramNameChange(event.target.value)}
            placeholder={t('Enter track name', '请输入节目名称')}
          />
          <button type="button" className="input-tool-btn" onClick={() => onKeyboardInput('program')}>{t('Keyboard', '键盘')}</button>
          <button
            type="button"
            className={`input-tool-btn ${listeningField === 'program' ? 'input-tool-btn-active' : ''}`}
            onClick={() => onSpeechInput('program')}
            disabled={!speechSupported || (!!listeningField && listeningField !== 'program')}
          >
            {listeningField === 'program' ? t('Listening...', '识别中...') : t('Speech to text', '语音转文字')}
          </button>
        </div>
      </div>

      <div className="dialog-field">
        <label className="dialog-label">{t('Host script', '主持人口播词')}</label>
        <textarea
          ref={hostScriptInputRef}
          className="dialog-textarea"
          value={editHostScript}
          onChange={(event) => onEditHostScriptChange(event.target.value)}
          placeholder={t('Enter manually or generate AI examples.', '可手动输入，或使用 AI 自动生成候选示例')}
        />
        <div className="dialog-input-row dialog-top-space">
          <button type="button" className="input-tool-btn" onClick={() => onKeyboardInput('hostScript')}>{t('Keyboard', '键盘')}</button>
          <button
            type="button"
            className={`input-tool-btn ${listeningField === 'hostScript' ? 'input-tool-btn-active' : ''}`}
            onClick={() => onSpeechInput('hostScript')}
            disabled={!speechSupported || (!!listeningField && listeningField !== 'hostScript')}
          >
            {listeningField === 'hostScript' ? t('Listening...', '识别中...') : t('Speech to text', '语音转文字')}
          </button>
          <button type="button" className="input-tool-btn" onClick={onGenerateHostScript} disabled={isGeneratingScript}>
            {isGeneratingScript ? t('Generating...', '生成中...') : t('Generate AI host script examples', 'AI 生成口播词示例')}
          </button>
        </div>
        {aiSuggestions.length > 0 && (
          <div className="script-suggestions">
            {aiSuggestions.map((item, index) => (
              <button
                key={`${item}-${index}`}
                type="button"
                className="suggestion-btn"
                onClick={() => onSelectSuggestion(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default TrackEditorDialog