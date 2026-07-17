/**
 * HTML sanitization + plain-text extraction at ingest.
 *
 * Every message body is stored twice under the user DEK: the raw provider HTML
 * (`raw_html_ct`) and a sanitized variant (`html_ct`) safe to render in a
 * sandboxed iframe. This is a conservative, dependency-free sanitizer — it strips
 * script/style/embed containers, event-handler attributes, and `javascript:` /
 * `data:` URLs. It is intentionally allowlist-free and errs toward removing
 * markup; a DOM-based sanitizer can drop in behind {@link sanitizeHtml} later
 * without changing callers.
 */

/** Tags whose entire content is dropped (never renderable / script-bearing). */
const DANGEROUS_BLOCKS = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template']

function stripBlock(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi')
  const selfClosing = new RegExp(`<${tag}\\b[^>]*/?>`, 'gi')
  return html.replace(re, '').replace(selfClosing, '')
}

/**
 * Sanitize provider HTML into something safe to render sandboxed.
 * Not a full HTML parser — see the file header.
 */
export function sanitizeHtml(html: string): string {
  let out = html
  for (const tag of DANGEROUS_BLOCKS) out = stripBlock(out, tag)
  // Drop <link>/<meta>/<base> singletons (external resource / base hijack vectors).
  out = out.replace(/<(?:link|meta|base)\b[^>]*>/gi, '')
  // Strip inline event handlers: on*="…" / on*='…' / on*=bare.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  // Neutralize javascript:/vbscript:/data: URLs in href/src.
  out = out.replace(
    /\b(href|src)\s*=\s*("|')?\s*(?:javascript|vbscript|data):[^"'>\s]*("|')?/gi,
    '$1="#"',
  )
  return out
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** Best-effort HTML → plain text, used only when a provider omits a text part. */
export function htmlToText(html: string): string {
  let text = html
  for (const tag of DANGEROUS_BLOCKS) text = stripBlock(text, tag)
  text = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  text = text.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char)
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
