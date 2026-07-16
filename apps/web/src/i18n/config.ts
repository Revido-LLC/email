import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import nl from './nl.json'

/** The locales Revido Mail ships with. Extend here when adding a language. */
export const SUPPORTED_LOCALES = ['en', 'nl'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** localStorage key for the persisted locale — owned by `AppStateProvider`. */
export const LOCALE_STORAGE_KEY = 'rm.locale'

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale)
}

// Resources are bundled at build time, so `init()` resolves synchronously —
// no network fetch, no loading flash on first paint.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      nl: { translation: nl },
    },
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LOCALES],
    interpolation: { escapeValue: false },
    // `AppStateProvider` owns persistence (under `rm.locale`, alongside the
    // rest of its localStorage-backed state) and calls `changeLanguage`
    // itself once it has read that value — the detector only supplies the
    // very first guess, from the browser, before that effect runs.
    detection: { order: ['navigator'], caches: [] },
  })

export default i18n
