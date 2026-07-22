/**
 * Reversible PII pseudonymization for chat.
 *
 * The LLM gateway (OpenRouter, account policy) scrubs real person names /
 * addresses to `[PERSON_NAME]`/`[ADDRESS]`, which leaks into answers and makes
 * the assistant useless ("the last email from [PERSON_NAME]…"). Rather than send
 * real PII at all, we do the privacy-correct thing: before the model sees the
 * context we swap each known real entity (a thread's contacts — plaintext
 * `name`/`email`) for an OPAQUE token the scrub passes through unchanged
 * (`Contact_1`, `Mailbox_1`), and after the answer streams back we swap the
 * tokens for the real values locally. The provider never sees real names; the
 * user always does.
 *
 * All logic here is pure/deterministic and unit-tested — no DB, no network.
 */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Email detector — any leftover address is PII the scrub would eat, so tokenize it too. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Token characters — a streamed token may split across SSE chunks along these. */
const TOKEN_TAIL_RE = /[A-Za-z0-9_]*$/

export interface StreamDecoder {
  /** Feed a stream chunk; returns text safe to emit with tokens already restored. */
  push(chunk: string): string
  /** Restore + return any buffered tail once the stream ends. */
  flush(): string
}

export interface Pseudonymizer {
  /** Swap known real PII in model-bound text for opaque tokens. Grows the map lazily for emails. */
  encode(text: string): string
  /** Restore tokens to real values in a whole string (non-streaming). */
  decode(text: string): string
  /** A streaming restorer for the SSE answer stream. */
  decoder(): StreamDecoder
  /** How many entities are mapped (0 ⇒ nothing to do). */
  size(): number
}

export interface EntityInput {
  name?: string | null
  email?: string | null
}

/**
 * Build a request-scoped pseudonymizer from the retrieved threads' contacts.
 * Longer values are matched first so "John Ryan" never half-replaces inside
 * "John Ryan Jr". Matching is case-insensitive; tokens restore to the canonical
 * (first-seen) spelling.
 */
export function makePseudonymizer(entities: readonly EntityInput[]): Pseudonymizer {
  const toToken = new Map<string, string>() // lowercased real → token
  const fromToken = new Map<string, string>() // token → real (display spelling)
  let nContact = 0
  let nMail = 0

  const assign = (real: string | null | undefined, kind: 'name' | 'email'): void => {
    const trimmed = real?.trim()
    if (!trimmed || trimmed.length < 2) return
    const key = trimmed.toLowerCase()
    if (toToken.has(key)) return
    const token = kind === 'name' ? `Contact_${++nContact}` : `Mailbox_${++nMail}`
    toToken.set(key, token)
    fromToken.set(token, trimmed)
  }
  for (const e of entities) {
    assign(e.name, 'name')
    assign(e.email, 'email')
  }

  const buildReplacer = (keys: string[]): RegExp | null =>
    keys.length ? new RegExp(keys.map(escapeRe).join('|'), 'g') : null

  // Real→token uses case-insensitive matching; sort longest-first to avoid partials.
  let encodeRe = buildReplacer([...toToken.keys()].sort((a, b) => b.length - a.length))
  encodeRe &&= new RegExp(encodeRe.source, 'gi')

  const encode = (text: string): string => {
    let out = encodeRe
      ? text.replace(encodeRe, (m) => toToken.get(m.toLowerCase()) ?? m)
      : text
    // Any remaining email is PII too — tokenize generically and extend the map.
    out = out.replace(EMAIL_RE, (m) => {
      const key = m.toLowerCase()
      const existing = toToken.get(key)
      if (existing) return existing
      const token = `Mailbox_${++nMail}`
      toToken.set(key, token)
      fromToken.set(token, m)
      return token
    })
    return out
  }

  /** token→real replacer, rebuilt lazily since `encode` can add email tokens. */
  const decodeReplacer = (): ((s: string) => string) => {
    const toks = [...fromToken.keys()].sort((a, b) => b.length - a.length)
    const re = buildReplacer(toks)
    return (s: string) => (re ? s.replace(re, (m) => fromToken.get(m) ?? m) : s)
  }

  return {
    encode,
    decode: (text) => decodeReplacer()(text),
    size: () => fromToken.size,
    decoder: (): StreamDecoder => {
      const replace = decodeReplacer()
      let buffer = ''
      return {
        push(chunk: string): string {
          buffer += chunk
          // Hold back a trailing token-char run — it might be a token split across chunks.
          const hold = buffer.match(TOKEN_TAIL_RE)?.[0] ?? ''
          const safe = buffer.slice(0, buffer.length - hold.length)
          buffer = hold
          return replace(safe)
        },
        flush(): string {
          const out = replace(buffer)
          buffer = ''
          return out
        },
      }
    },
  }
}
