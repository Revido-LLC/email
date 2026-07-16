import * as React from 'react'
import i18n, { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from '@/i18n/config'

export type AiTab = 'insights' | 'chat'
export type Theme = 'light' | 'dark'
export type { Locale }

interface AppState {
  navCollapsed: boolean
  toggleNav: () => void
  aiPanelOpen: boolean
  toggleAiPanel: () => void
  setAiPanelOpen: (open: boolean) => void
  /** Mobile-only: the assistant is a slide-over below `lg`, closed by default. */
  mobileAiOpen: boolean
  setMobileAiOpen: (open: boolean) => void
  aiTab: AiTab
  setAiTab: (tab: AiTab) => void
  theme: Theme
  toggleTheme: () => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  locale: Locale
  setLocale: (locale: Locale) => void
}

const AppStateContext = React.createContext<AppState | null>(null)

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

/** Falls back to `navigator.language` (e.g. `nl-NL` → `nl`), then `en`. */
function detectDefaultLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language.toLowerCase()
  return SUPPORTED_LOCALES.find((l) => lang.startsWith(l)) ?? 'en'
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [navCollapsed, setNavCollapsed] = React.useState(() => readStored('rm.navCollapsed', false))
  const [aiPanelOpen, setAiPanelOpen] = React.useState(() => readStored('rm.aiPanelOpen', true))
  const [mobileAiOpen, setMobileAiOpen] = React.useState(false)
  const [aiTab, setAiTab] = React.useState<AiTab>('insights')
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [theme, setTheme] = React.useState<Theme>(() => {
    const stored = readStored<Theme | null>('rm.theme', null)
    if (stored) return stored
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      return 'dark'
    return 'light'
  })
  const [locale, setLocale] = React.useState<Locale>(() => {
    const stored = readStored<string | null>(LOCALE_STORAGE_KEY, null)
    return isSupportedLocale(stored) ? stored : detectDefaultLocale()
  })

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem('rm.theme', JSON.stringify(theme))
  }, [theme])

  React.useEffect(() => {
    window.localStorage.setItem('rm.navCollapsed', JSON.stringify(navCollapsed))
  }, [navCollapsed])
  React.useEffect(() => {
    window.localStorage.setItem('rm.aiPanelOpen', JSON.stringify(aiPanelOpen))
  }, [aiPanelOpen])

  React.useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(locale))
    void i18n.changeLanguage(locale)
  }, [locale])

  const value: AppState = {
    navCollapsed,
    toggleNav: () => setNavCollapsed((v) => !v),
    aiPanelOpen,
    toggleAiPanel: () => setAiPanelOpen((v) => !v),
    setAiPanelOpen,
    mobileAiOpen,
    setMobileAiOpen,
    aiTab,
    setAiTab,
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    commandOpen,
    setCommandOpen,
    locale,
    setLocale,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = React.useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

/** Convenience slice of `useAppState` for components that only need locale. */
export function useLocale(): Pick<AppState, 'locale' | 'setLocale'> {
  const { locale, setLocale } = useAppState()
  return { locale, setLocale }
}
