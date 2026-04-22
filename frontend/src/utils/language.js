const LANGUAGE_COOKIE_KEY = 'aurexlive-language'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function normalizeLanguage(value) {
  const lowered = String(value || '').trim().toLowerCase()

  if (lowered.startsWith('zh')) {
    return 'zh'
  }

  return 'en'
}

export function localizeText(language, englishText, chineseText) {
  return normalizeLanguage(language) === 'zh' ? chineseText : englishText
}

function readCookie(name) {
  if (typeof document === 'undefined') {
    return ''
  }

  const cookiePrefix = `${name}=`
  const found = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(cookiePrefix))

  if (!found) {
    return ''
  }

  return decodeURIComponent(found.slice(cookiePrefix.length))
}

function writeCookie(name, value, maxAgeSeconds = ONE_YEAR_SECONDS) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
}

export function getPreferredLanguage() {
  if (typeof window === 'undefined') {
    return 'en'
  }

  return normalizeLanguage(readCookie(LANGUAGE_COOKIE_KEY) || 'en')
}

export function setPreferredLanguage(nextLanguage) {
  writeCookie(LANGUAGE_COOKIE_KEY, normalizeLanguage(nextLanguage))
}