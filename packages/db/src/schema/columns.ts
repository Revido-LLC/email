/**
 * Reusable column builders and custom Postgres types.
 *
 * The two load-bearing custom types encode the storage-at-rest boundary:
 *
 * - `encrypted(name)` — a `jsonb` column that holds a {@link Ciphertext} (the
 *   AES-256-GCM envelope produced by `@revido/db/crypto`). Everything that is
 *   *content* — message bodies, subjects, AI-derived text, OAuth tokens — lives
 *   in one of these. The DB only ever sees opaque ciphertext; decryption happens
 *   in the audited server path with the user's DEK.
 * - `vector(name, { dimensions })` — a pgvector column for ANN search. Embeddings
 *   are numeric vectors (not readable text) and MUST stay plaintext so pgvector
 *   can index and search them; see `message_embeddings`.
 *
 * Column builders are returned from functions (never shared const instances) so
 * each table gets its own fresh builder — drizzle mutates builder state while
 * assembling a table, so reusing one instance across tables is a footgun.
 */
import { customType, jsonb, timestamp } from 'drizzle-orm/pg-core'
import type { Ciphertext } from '../crypto'

/**
 * A DEK-encrypted value. Stored as `jsonb` holding the {@link Ciphertext} shape
 * (`{ ct, iv, tag, v }`). For structured payloads (e.g. an array of affected
 * threads) the value is `JSON.stringify`d, encrypted, and the resulting single
 * Ciphertext is stored here.
 */
export const encrypted = (name: string) => jsonb(name).$type<Ciphertext>()

/**
 * pgvector column. drizzle-kit emits `vector(<dimensions>)`; the `vector`
 * extension must be enabled first (see the extensions migration). postgres-js
 * exchanges the value as the textual `[a,b,c]` form.
 */
export const vector = customType<{
  data: number[]
  config: { dimensions: number }
  configRequired: true
  driverData: string
}>({
  dataType(config) {
    return `vector(${config.dimensions})`
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .filter((s) => s.length > 0)
      .map(Number)
  },
})

/** `created_at` / `updated_at`, both `timestamptz` defaulting to `now()`. */
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A `timestamptz` column defaulting to `now()` (for append-only `created_at`). */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
