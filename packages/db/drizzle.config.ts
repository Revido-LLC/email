/**
 * drizzle-kit config. `pnpm db:generate` diffs `src/schema.ts` against the
 * migration history in `./drizzle` and writes the next SQL migration. The
 * hand-authored RLS / extension migration (`0001_rls_policies.sql`) lives
 * alongside the generated `0000_init_schema.sql` and is tracked in the journal.
 * `db:migrate` applies them in order using `DATABASE_URL` (a direct, non-pooled
 * connection).
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
