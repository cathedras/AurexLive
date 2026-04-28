import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

import { getPreferredLanguage, localizeText, normalizeLanguage, setPreferredLanguage } from '../utils/language'

export const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => getPreferredLanguage())

  useEffect(() => {
    const nextLanguage = normalizeLanguage(language)
    setPreferredLanguage(nextLanguage)

    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextLanguage === 'zh' ? 'zh-CN' : 'en'
    }
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage: (nextLanguage) => setLanguageState(normalizeLanguage(nextLanguage)),
    toggleLanguage: () => setLanguageState((current) => (normalizeLanguage(current) === 'zh' ? 'en' : 'zh')),
    isEnglish: normalizeLanguage(language) === 'en',
    isChinese: normalizeLanguage(language) === 'zh',
    t: (englishText, chineseText) => localizeText(language, englishText, chineseText),
  }), [language])

  return createElement(LanguageContext.Provider, { value }, children)
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }

  return context
}