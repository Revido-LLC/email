/**
 * The `onMailboxLinked` seam implementation.
 *
 * When a mailbox provider is connected — either Better Auth's primary social
 * sign-in (`databaseHooks.account.create.after` in `../auth`) or the second-mailbox
 * OAuth callback — the provider's OAuth tokens must be captured, encrypted under
 * the user's DEK, into the domain `accounts` table, and an initial `backfill` job
 * enqueued. Both paths funnel through {@link linkMailbox}; {@link onMailboxLinked}
 * adapts Better Auth's `account` row to it (deriving the mailbox address from the
 * user's own email, which for the primary mailbox is the sign-in address).
 *
 * The Better Auth hook path is best-effort: a failure here must never break
 * sign-in, so {@link onMailboxLinked} swallows and logs errors.
 */
import { asService, withUser } from '@revido/db/client'
import { accounts, users } from '@revido/db/schema'
import type { Provider } from '@revido/db'
import { and, eq } from 'drizzle-orm'
import type { ProviderAccount } from '../auth'
import { ensureUserKey, getUserCrypto } from './crypto'
import { enqueueJob, JobQueue } from './jobs'

/** Map a Better Auth provider id to the domain `Provider`, or null if not mail. */
export function toMailProvider(providerId: string): Provider | null {
  if (providerId === 'google') return 'gmail'
  if (providerId === 'microsoft') return 'outlook'
  return null
}

export interface LinkMailboxInput {
  provider: Provider
  email: string
  name?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  tokenExpiresAt?: Date | null
  scopes?: string[] | null
}

export interface LinkMailboxResult {
  accountId: string
  /** False when this address was already connected for the user. */
  created: boolean
}

/** Provider user-info casing is not stable enough to use as mailbox identity. */
export function normalizeMailboxEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Upsert a connected mailbox (encrypting its tokens) and enqueue an initial
 * backfill. Returns the canonical account id and whether it was newly created.
 */
export async function linkMailbox(userId: string, input: LinkMailboxInput): Promise<LinkMailboxResult> {
  await ensureUserKey(userId)
  const crypto = await getUserCrypto(userId)
  const email = normalizeMailboxEmail(input.email)

  const accessTokenCt = input.accessToken ? crypto.encrypt(input.accessToken) : null
  const refreshTokenCt = input.refreshToken ? crypto.encrypt(input.refreshToken) : null

  const result = await withUser(userId, async (tx) => {
    const existing = (
      await tx
        .select({ id: accounts.id, provider: accounts.provider })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.email, email)))
        .limit(1)
    ).at(0)

    if (existing) {
      // A same-provider reconnect refreshes credentials, but it is not a new
      // mailbox and must not enqueue another initial backfill. An address that
      // somehow resolves through another provider remains attached to its
      // original connector rather than receiving incompatible credentials.
      if (existing.provider === input.provider) {
        await tx
          .update(accounts)
          .set({
            accessTokenCt,
            refreshTokenCt,
            tokenExpiresAt: input.tokenExpiresAt ?? null,
            scopes: input.scopes ?? null,
            name: input.name ?? null,
          })
          .where(eq(accounts.id, existing.id))
      }
      return { accountId: existing.id, created: false }
    }

    const rows = await tx
      .insert(accounts)
      .values({
        userId,
        provider: input.provider,
        email,
        name: input.name ?? null,
        accessTokenCt,
        refreshTokenCt,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        scopes: input.scopes ?? null,
        syncProgress: 0,
        syncLabel: 'Queued',
      })
      .onConflictDoNothing({ target: [accounts.userId, accounts.email] })
      .returning({ id: accounts.id })
    const row = rows.at(0)
    if (row) return { accountId: row.id, created: true }

    // A concurrent callback won the insert. Resolve the canonical row and
    // report the operation as idempotent.
    const raced = (
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.email, email)))
        .limit(1)
    ).at(0)
    if (!raced) throw new Error('failed to link account')
    return { accountId: raced.id, created: false }
  })

  if (result.created) {
    await enqueueJob(JobQueue.backfill, {
      userId,
      accountId: result.accountId,
      provider: input.provider,
    })
  }
  return result
}

/**
 * The `OnMailboxLinked` seam Better Auth invokes on account creation. Best-effort:
 * never throws (so a capture failure can't break sign-in).
 */
export async function onMailboxLinked(
  userId: string,
  providerAccount: ProviderAccount,
): Promise<void> {
  try {
    const provider = toMailProvider(providerAccount.providerId)
    if (!provider) return // credential provider or a non-mail link.

    // The mailbox address: for the primary sign-in this is the user's own email.
    const email = await asService(async (tx) => {
      const row = (
        await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
      ).at(0)
      return row
    })
    if (!email?.email) return

    await linkMailbox(userId, {
      provider,
      email: email.email,
      name: email.name,
      accessToken: providerAccount.accessToken,
      refreshToken: providerAccount.refreshToken,
      tokenExpiresAt: providerAccount.accessTokenExpiresAt ?? null,
      scopes: providerAccount.scope ? providerAccount.scope.split(' ') : null,
    })
  } catch (err) {
    console.error('[api] onMailboxLinked failed', err)
  }
}
