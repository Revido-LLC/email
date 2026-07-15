import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { useAppState } from './app-state'

/** True when the user is typing into a field — suppresses single-key shortcuts. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/**
 * Global keyboard map (see the plan's keyboard section). Two-key `g` sequences
 * navigate; ⌘K/⌘J toggle the palette and AI panel. Screen-local keys (j/k/e/r
 * in lists & takeover) are handled by those screens.
 */
export function useGlobalKeyboard() {
  const navigate = useNavigate()
  const { setCommandOpen, toggleAiPanel, toggleNav, toggleTheme } = useAppState()
  const pendingG = React.useRef(false)
  const gTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        toggleAiPanel()
        return
      }
      if (mod && e.key === '\\') {
        e.preventDefault()
        toggleNav()
        return
      }

      if (mod || e.altKey) return
      if (isTyping(e.target)) return

      // Two-key `g _` navigation
      if (pendingG.current) {
        pendingG.current = false
        if (gTimer.current) clearTimeout(gTimer.current)
        const dest: Record<string, string> = {
          i: '/app/inbox',
          t: '/app',
          a: '/app/agents',
          r: '/app/reminders',
          s: '/app/settings',
        }
        const to = dest[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          void navigate({ to })
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          pendingG.current = true
          if (gTimer.current) clearTimeout(gTimer.current)
          gTimer.current = setTimeout(() => (pendingG.current = false), 900)
          break
        case 'c':
          e.preventDefault()
          void navigate({ to: '/app/compose' })
          break
        case '/':
          e.preventDefault()
          setCommandOpen(true)
          break
        case 't':
          // shift+T toggles theme (plain t is reserved for future thread actions)
          if (e.shiftKey) {
            e.preventDefault()
            toggleTheme()
          }
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setCommandOpen, toggleAiPanel, toggleNav, toggleTheme])
}
