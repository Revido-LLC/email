import * as React from 'react'
import { useAppState } from '@/lib/app-state'

/**
 * Renders a message's pre-sanitized HTML body inside a sandboxed iframe so email
 * markup can never touch the app's styles or run scripts. The sandbox keeps
 * scripts disabled (no `allow-scripts`); `allow-same-origin` is present only so
 * the parent can measure the rendered body and auto-size the frame — reading the
 * content document, nothing more.
 */
export function EmailFrame({ html }: { html: string }) {
  const { theme } = useAppState()
  const ref = React.useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = React.useState<number>()

  // Re-generate the document when the body or the theme changes so colors track
  // light/dark. Colors are pulled from the live token variables on :root.
  const srcDoc = React.useMemo(() => buildDoc(html), [html, theme])

  const measure = React.useCallback(() => {
    const el = ref.current
    try {
      const doc = el?.contentDocument
      const body = doc?.body
      if (body) {
        const next = Math.ceil(Math.max(body.scrollHeight, doc!.documentElement.scrollHeight))
        if (next > 0) setHeight(next + 2)
      }
    } catch {
      // Opaque cross-origin frame — fall back to the min height below.
    }
  }, [])

  React.useEffect(() => {
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [measure])

  return (
    <iframe
      ref={ref}
      title="Message body"
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={measure}
      className="block w-full border-0 bg-card"
      style={{ height: height ? `${height}px` : undefined, minHeight: '1.5rem' }}
    />
  )
}

function buildDoc(html: string): string {
  const c = readColors()
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>
    html,body{margin:0;padding:0;background:${c.bg};color-scheme:${c.scheme};}
    body{font:400 15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${c.fg};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;word-break:break-word;overflow-wrap:anywhere;}
    p{margin:0 0 12px;}
    a{color:${c.link};text-decoration:underline;text-underline-offset:2px;}
    ol,ul{margin:12px 0;padding-left:20px;}
    li{margin:4px 0;}
    strong{font-weight:600;}
    em{font-style:italic;}
    h1,h2,h3,h4{margin:16px 0 8px;line-height:1.3;}
    code{background:${c.code};border-radius:6px;padding:1px 5px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
    blockquote{margin:12px 0;padding-left:12px;border-left:2px solid ${c.border};color:${c.muted};}
    img{max-width:100%;height:auto;}
    hr{border:none;border-top:1px solid ${c.border};margin:16px 0;}
    *:last-child{margin-bottom:0;}
  </style></head><body>${html}</body></html>`
}

function readColors() {
  const dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  if (typeof document === 'undefined') {
    return {
      fg: 'CanvasText',
      muted: 'GrayText',
      link: 'LinkText',
      border: 'GrayText',
      code: 'Canvas',
      bg: 'Canvas',
      scheme: 'light',
    }
  }
  const s = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    fg: get('--foreground', 'CanvasText'),
    muted: get('--muted-foreground', 'GrayText'),
    link: get('--primary', 'LinkText'),
    border: get('--border', 'GrayText'),
    code: get('--muted', 'Canvas'),
    bg: get('--card', 'Canvas'),
    scheme: dark ? 'dark' : 'light',
  }
}
