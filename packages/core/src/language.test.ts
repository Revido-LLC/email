import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, normalizeLocale, resolveOutputLanguage } from './language'

describe('resolveOutputLanguage', () => {
  it('honors an explicit output-language preference', () => {
    expect(resolveOutputLanguage('nl', 'en')).toBe('nl')
    expect(resolveOutputLanguage('en', 'nl')).toBe('en')
  })

  it('echoes the detected language when preference is "match"', () => {
    expect(resolveOutputLanguage('match', 'nl')).toBe('nl')
    expect(resolveOutputLanguage('match', 'en-US')).toBe('en')
  })

  it('falls back to the default locale for unsupported/undefined languages', () => {
    expect(resolveOutputLanguage('match', undefined)).toBe(DEFAULT_LOCALE)
    expect(resolveOutputLanguage('match', 'fr')).toBe(DEFAULT_LOCALE)
  })
})

describe('normalizeLocale', () => {
  it('reduces a BCP-47 tag to a supported base locale', () => {
    expect(normalizeLocale('nl-BE')).toBe('nl')
    expect(normalizeLocale('EN')).toBe('en')
    expect(normalizeLocale('de')).toBe(DEFAULT_LOCALE)
  })
})
