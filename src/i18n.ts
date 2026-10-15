import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'
import es from './locales/es.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'

export const SUPPORTED_LOCALES = ['en', 'zh', 'es', 'ja', 'ko'] as const
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]
export const LOCALE_STORAGE_KEY = 'mv-locale'

function detectInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as LocaleCode
    }
    const nav = (window.navigator?.language ?? 'en').toLowerCase()
    if (nav.startsWith('zh')) return 'zh'
    if (nav.startsWith('ja')) return 'ja'
    if (nav.startsWith('ko')) return 'ko'
    if (nav.startsWith('es')) return 'es'
  } catch {
    // ignore localStorage / navigator access errors
  }
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'en',
  messages: { en, zh, es, ja, ko }
})

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', i18n.global.locale.value)
}

export function setLocale(locale: LocaleCode) {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return
  i18n.global.locale.value = locale
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // ignore quota / private mode errors
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale)
  }
}
