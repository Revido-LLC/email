import type { CategoryId, CategoryMeta } from './types'

/**
 * The locked category color system. `token` is the Tailwind stem: the UI layer
 * provides `bg-cat-<token>`, `text-cat-<token>`, `border-cat-<token>` utilities
 * backed by CSS variables (see packages/ui/src/styles/theme.css).
 */
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
