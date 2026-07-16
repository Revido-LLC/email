import i18n from './config'

/**
 * Locale-aware `Intl` helpers. All bind to `i18n.language`, so callers don't
 * need to thread the active locale through — just call these instead of
 * `.toLocaleString()` / `new Date().toLocaleDateString()` and formatting
 * follows the user's chosen language automatically.
 */

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat(i18n.language, options ?? { dateStyle: 'medium' }).format(d)
}

export function formatDateTime(date: Date | string | number): string {
  return formatDate(date, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.language, options).format(value)
}
