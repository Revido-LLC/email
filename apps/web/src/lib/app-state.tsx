import * as React from 'react'

export type AiTab = 'insights' | 'chat'
export type Theme = 'light' | 'dark'

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
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppState {
  const ctx = React.useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
