/**
 * Contact upsert — the normalized address book write path.
 *
 * Threads and messages reference `contacts` by id (via `thread_participants` /
 * `message_recipients` / `messages.from_contact_id`) rather than inlining an
 * address, so the send path must resolve each `{ email, name }` to a contact id
 * first. `(user_id, email)` is unique, so this upserts idempotently under the
 * caller's RLS scope.
 */
import type { DbTransaction } from '@revido/db/client'
import { contacts } from '@revido/db/schema'
import { and, eq } from 'drizzle-orm'

export interface ContactInput {
  email: string
  name?: string
}

/** Upsert one contact for `userId`, returning its id. */
export async function upsertContact(
  tx: DbTransaction,
  userId: string,
  input: ContactInput,
): Promise<string> {
  const email = input.email.trim().toLowerCase()
  const inserted = await tx
    .insert(contacts)
    .values({ userId, email, name: input.name ?? null })
    .onConflictDoNothing({ target: [contacts.userId, contacts.email] })
    .returning({ id: contacts.id })

  const insertedId = inserted.at(0)?.id
  if (insertedId) return insertedId

  // Already present (conflict) — read the existing id.
  const existing = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.email, email)))
    .limit(1)
  const id = existing.at(0)?.id
  if (!id) throw new Error('failed to upsert contact')
  return id
}
