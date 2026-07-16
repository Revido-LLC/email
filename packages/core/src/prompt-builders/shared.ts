/**
 * Shared helpers for the AI prompt builders.
 *
 * Keep the *system* prefix stable (no per-request data) so prompt caching works;
 * the volatile bits — the concrete target language, the rendered thread — go in
 * the user turn, after the cache breakpoint.
 */

import type { LanguageCode, Message, OutputLanguage, Thread } from '@revido/db'
import { resolveOutputLanguage, type SupportedLocale } from '../language'
import type { OutputLanguageOptions, PromptMessage } from '../prompts'

const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  nl: 'Dutch',
}

/** Human-readable name for a supported locale, e.g. 'nl' -> 'Dutch'. */
export function localeName(locale: SupportedLocale): string {
  return LOCALE_NAMES[locale]
}

/**
 * The concrete "write your output in <language>" directive for the user turn.
 * Resolves the user's preference against the detected source language.
 */
export function outputLanguageDirective(opts: OutputLanguageOptions): string {
  const locale = resolveOutputLanguage(
    opts.outputLanguage,
    opts.detectedLanguage as LanguageCode | undefined,
  )
  const name = localeName(locale)
  if (opts.outputLanguage === 'match') {
    return `Write your entire response in ${name} (${locale}) — the language of the source email. Do not translate the user's content into another language.`
  }
  return `Write your entire response in ${name} (${locale}), regardless of the language of the source email.`
}

/** The stable multilingual policy line for system prefixes. */
export const MULTILINGUAL_POLICY =
  'Revido Mail is multilingual (English and Dutch). Always honor the explicit output-language instruction given in the user turn, and keep names, quotes, and technical terms intact.'

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Best available plain text for a message body. */
export function messageBodyText(message: Pick<Message, 'text' | 'html'>): string {
  if (message.text && message.text.trim()) return message.text.trim()
  if (message.html) return stripHtml(message.html)
  return ''
}

function formatContact(c: { name: string; email: string }): string {
  return c.name ? `${c.name} <${c.email}>` : c.email
}

/** Render a thread + its messages as a readable transcript for the user turn. */
export function renderThreadTranscript(thread: Thread, messages: Message[]): string {
  const lines: string[] = [`Subject: ${thread.subject}`, '']
  messages.forEach((m, i) => {
    const direction = m.outbound ? 'sent by the user' : 'received'
    lines.push(
      `--- Message ${i + 1} of ${messages.length} (${direction}; from ${formatContact(m.from)}; ${m.date}) ---`,
    )
    if (m.to.length) lines.push(`To: ${m.to.map(formatContact).join(', ')}`)
    lines.push('', messageBodyText(m), '')
  })
  return lines.join('\n').trim()
}

/** Wrap rendered content + a language directive into the single user turn. */
export function userTurn(directive: string, ...blocks: string[]): PromptMessage[] {
  return [{ role: 'user', content: [directive, ...blocks].filter(Boolean).join('\n\n') }]
}

/** Narrow re-export so builders don't import OutputLanguage from db directly. */
export type { OutputLanguage }
