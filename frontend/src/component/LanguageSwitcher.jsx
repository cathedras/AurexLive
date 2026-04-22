import { useLanguage } from '../context/languageContext'

function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="language-switcher" aria-label="Language switcher">
      <button
        type="button"
        className={`language-switcher-btn ${language === 'en' ? 'language-switcher-btn-active' : ''}`.trim()}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`language-switcher-btn ${language === 'zh' ? 'language-switcher-btn-active' : ''}`.trim()}
        onClick={() => setLanguage('zh')}
      >
        中文
      </button>
    </div>
  )
}

export default LanguageSwitcher