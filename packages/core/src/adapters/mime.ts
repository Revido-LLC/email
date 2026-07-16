/**
 * Minimal RFC 822 / MIME helpers shared by the adapters.
 *
 * Gmail's `messages.send` wants a raw, base64url-encoded RFC 822 message, and
 * both providers hand back RFC 2822 address strings in headers. These helpers
 * parse those addresses and build a well-formed multipart/alternative message
 * with the threading headers (`In-Reply-To` / `References`) that keep replies in
 * the same conversation.
 */

export interface Address {
  name: string
  email: string
}

/** URL-safe base64 (Gmail `raw` payloads + attachment bodies). */
export function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

export function decodeBase64Url(input: string): string {
  // Gmail returns standard base64url; Node accepts it directly.
  return Buffer.from(input, 'base64url').toString('utf8')
}

/** Parse a single address like `"Doe, Jane" <jane@example.com>` or `jane@example.com`. */
export function parseAddress(raw: string): Address {
  const trimmed = raw.trim()
  const angled = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(trimmed)
  if (angled) {
    const name = stripQuotes(angled[1] ?? '').trim()
    return { name, email: (angled[2] ?? '').trim() }
  }
  return { name: '', email: trimmed }
}

/** Split a comma-separated address list, respecting quotes and angle brackets. */
export function parseAddressList(raw: string | undefined): Address[] {
  if (!raw) return []
  const parts: string[] = []
  let depthAngle = 0
  let inQuote = false
  let current = ''
  for (const ch of raw) {
    if (ch === '"') inQuote = !inQuote
    else if (ch === '<' && !inQuote) depthAngle++
    else if (ch === '>' && !inQuote) depthAngle = Math.max(0, depthAngle - 1)
    if (ch === ',' && !inQuote && depthAngle === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.map((p) => parseAddress(p)).filter((a) => a.email.length > 0)
}

function stripQuotes(s: string): string {
  return s.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')
}

/** Encode a header word (subject, display name) as RFC 2047 when non-ASCII. */
function encodeWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Render an address for a header: `"Name" <email>` (quoted when needed). */
export function formatAddress(addr: Address): string {
  if (!addr.name) return addr.email
  const encoded = encodeWord(addr.name)
  // If we base64-encoded it, it's already a safe RFC 2047 word; else quote when
  // it contains characters that aren't allowed in a bare atom.
  const needsQuote = encoded === addr.name && /[",;:<>@[\]\\]/.test(addr.name)
  const display = needsQuote ? `"${addr.name.replace(/"/g, '\\"')}"` : encoded
  return `${display} <${addr.email}>`
}

export interface Rfc822Options {
  from?: Address
  to: Address[]
  cc?: Address[]
  bcc?: Address[]
  subject: string
  html: string
  text: string
  /** RFC Message-ID of the message being replied to (`<...>`). */
  inReplyTo?: string
  /** Existing References chain from the parent message. */
  references?: string
}

/** Build a raw multipart/alternative RFC 822 message (not yet base64url-encoded). */
export function buildRfc822(opts: Rfc822Options): string {
  const boundary = `--=_revido_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
  const headers: string[] = []
  if (opts.from) headers.push(`From: ${formatAddress(opts.from)}`)
  headers.push(`To: ${opts.to.map(formatAddress).join(', ')}`)
  if (opts.cc && opts.cc.length) headers.push(`Cc: ${opts.cc.map(formatAddress).join(', ')}`)
  if (opts.bcc && opts.bcc.length) headers.push(`Bcc: ${opts.bcc.map(formatAddress).join(', ')}`)
  headers.push(`Subject: ${encodeWord(opts.subject)}`)
  if (opts.inReplyTo) {
    headers.push(`In-Reply-To: ${opts.inReplyTo}`)
    const refs = [opts.references, opts.inReplyTo].filter(Boolean).join(' ')
    headers.push(`References: ${refs}`)
  }
  headers.push('MIME-Version: 1.0')
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.html,
    `--${boundary}--`,
    '',
  ].join('\r\n')

  return `${headers.join('\r\n')}\r\n\r\n${body}`
}
