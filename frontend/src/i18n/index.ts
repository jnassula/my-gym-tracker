import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

export const LANGUAGES = ['pt', 'en', 'es'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'mygymtracker-lang'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** Saved choice, then the browser's language, then Portuguese. */
export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  const browser = navigator.language.slice(0, 2).toLowerCase()
  return isLanguage(browser) ? browser : 'pt'
}

/** Once signed in, the language saved on the account wins. */
export function applyLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Preference just won't survive a reload.
  }
  document.documentElement.lang = language
  if (i18n.language !== language) void i18n.changeLanguage(language)
}

void i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
  lng: detectLanguage(),
  fallbackLng: 'pt',
  interpolation: { escapeValue: false }, // React already escapes
})

document.documentElement.lang = i18n.language

export default i18n
