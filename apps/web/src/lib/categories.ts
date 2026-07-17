/**
 * The 9 locked triage categories — fixed product taxonomy, not per-user data.
 *
 * Per `docs/api-contract.md` these ship as a frontend constant rather than a live
 * endpoint. They used to live in `@revido/mock-data`; now that the screens read
 * real data, the constant lives here so nothing in the app imports a mock getter.
 * `token` is the Tailwind stem behind the `bg-cat-*` / `text-cat-*` utilities.
 */
import type { CategoryId, CategoryMeta } from '@revido/db'

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  'to-reply': { id: 'to-reply', label: 'To Reply', token: 'to-reply', icon: 'Reply' },
  'awaiting-reply': {
    id: 'awaiting-reply',
    label: 'Awaiting Reply',
    token: 'awaiting-reply',
    icon: 'Clock',
  },
  fyi: { id: 'fyi', label: 'FYI', token: 'fyi', icon: 'Info' },
  newsletters: { id: 'newsletters', label: 'Newsletters', token: 'newsletters', icon: 'Newspaper' },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    token: 'notifications',
    icon: 'Bell',
  },
  promotions: { id: 'promotions', label: 'Promotions', token: 'promotions', icon: 'Tag' },
  receipts: {
    id: 'receipts',
    label: 'Receipts',
    token: 'receipts',
    icon: 'Receipt',
    keywords: ['invoice', 'invoices', 'billing'],
  },
  calendar: { id: 'calendar', label: 'Calendar', token: 'calendar', icon: 'Calendar' },
  personal: { id: 'personal', label: 'Personal', token: 'personal', icon: 'Heart' },
}

/** Display order for the nav rail categories group. */
export const CATEGORY_ORDER: CategoryId[] = [
  'to-reply',
  'awaiting-reply',
  'fyi',
  'newsletters',
  'notifications',
  'promotions',
  'receipts',
  'calendar',
  'personal',
]

export const CATEGORY_LIST: CategoryMeta[] = CATEGORY_ORDER.map((id) => CATEGORIES[id])
