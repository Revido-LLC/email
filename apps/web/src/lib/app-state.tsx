import * as React from 'react'
import i18n, {
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type Locale,
} from '@/i18n/config'

export type AiTab = 'insights' | 'chat'
/** The resolved, applied theme. */
export type Theme = 'light' | 'dark'
/** The user's chosen preference — `system` follows the OS setting live. */
export type ThemePreference = 'light' | 'dark' | 'system'
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
  /** A question handed to the assistant chat (e.g. from ⌘K "Ask AI"); consumed once. */
  aiChatQuery: string | null
  setAiChatQuery: (query: string | null) => void
  /** The resolved theme actually applied to the document (`light` | `dark`). */
  theme: Theme
  /** The user's stored preference (`light` | `dark` | `system`). */
  themePreference: ThemePreference
  setThemePreference: (preference: ThemePreference) => void
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

/** The OS's current color-scheme preference. */
function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Resolve a stored preference to the theme to actually apply. */
function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference
}

/**
 * Read the initial theme preference, migrating the legacy `rm.theme` value
 * (`light` | `dark`, written before the picker existed) into an explicit choice.
 */
function readInitialThemePreference(): ThemePreference {
  const stored = readStored<ThemePreference | null>('rm.themePreference', null)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  const legacy = readStored<Theme | null>('rm.theme', null)
  if (legacy === 'light' || legacy === 'dark') return legacy
  return 'system'
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [navCollapsed, setNavCollapsed] = React.useState(() => readStored('rm.navCollapsed', false))
  const [aiPanelOpen, setAiPanelOpen] = React.useState(() => readStored('rm.aiPanelOpen', true))
  const [mobileAiOpen, setMobileAiOpen] = React.useState(false)
  const [aiTab, setAiTab] = React.useState<AiTab>('insights')
  const [aiChatQuery, setAiChatQuery] = React.useState<string | null>(null)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [themePreference, setThemePreference] = React.useState<ThemePreference>(
    readInitialThemePreference,
  )
  const [theme, setTheme] = React.useState<Theme>(() => resolveTheme(readInitialThemePreference()))
  const [locale, setLocale] = React.useState<Locale>(() => {
    const stored = readStored<string | null>(LOCALE_STORAGE_KEY, null)
    return isSupportedLocale(stored) ? stored : detectDefaultLocale()
  })

  // Persist the preference and recompute the resolved theme from it.
  React.useEffect(() => {
    window.localStorage.setItem('rm.themePreference', JSON.stringify(themePreference))
    setTheme(resolveTheme(themePreference))
  }, [themePreference])

  // While following the system, track OS changes live.
  React.useEffect(() => {
    if (themePreference !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePreference])

  // Apply the resolved theme to the document. `rm.theme` is kept in sync for
  // backward compatibility (older reads) though the class is the source of truth.
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
    toggleAiPanel: () => {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        setMobileAiOpen((v) => !v)
        return
      }
      setAiPanelOpen((v) => !v)
    },
    setAiPanelOpen,
    mobileAiOpen,
    setMobileAiOpen,
    aiTab,
    setAiTab,
    aiChatQuery,
    setAiChatQuery,
    theme,
    themePreference,
    setThemePreference,
    // Toggle flips to the opposite of the *resolved* theme, pinning an explicit
    // preference (so a Shift+T from `system` lands on a concrete light/dark).
    toggleTheme: () =>
      setThemePreference((prev) => (resolveTheme(prev) === 'dark' ? 'light' : 'dark')),
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
