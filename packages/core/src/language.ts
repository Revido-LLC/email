/**
 * Language utilities (W5/W7/W10) — the EN/NL multilingual layer.
 *
 * Language *detection* is a triage output (a field in the Haiku structured
 * response), not a separate call. These helpers resolve the effective output
 * language and normalize tags. Filled in by Wave 1 `core-domain`.
 */

import type { LanguageCode, OutputLanguage } from '@revido/db'

/** Languages the product localizes end to end. */
export const SUPPORTED_LOCALES = ['en', 'nl'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'en'

/**
 * Resolve the language AI output should be written in, given the user's
 * preference and the detected language of the source content.
 */
export function resolveOutputLanguage(
  preference: OutputLanguage,
  detected: LanguageCode | undefined,
): SupportedLocale {
  if (preference === 'en' || preference === 'nl') return preference
  // preference === 'match'
  return normalizeLocale(detected)
}

export function normalizeLocale(tag: LanguageCode | undefined): SupportedLocale {
  const base = (tag ?? DEFAULT_LOCALE).slice(0, 2).toLowerCase()
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : DEFAULT_LOCALE
}
