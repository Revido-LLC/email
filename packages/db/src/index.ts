/**
 * @revido/db — the data layer.
 *
 * Drizzle schema + migrations, typed Supabase clients, zod schemas, and
 * envelope-crypto helpers. The domain types (below) are the API contract; the
 * frontend and every service import them from here. `@revido/mock-data` is
 * demoted to seed/fixtures.
 */

export * from './domain'
export * from './crypto'

// Subpath entrypoints (schema/client/zod) are exported via package.json
// "exports" and imported directly, e.g. `import { threads } from '@revido/db/schema'`.
