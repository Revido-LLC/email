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
import { eq } from 'drizzle-orm'
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

/**
 * Upsert a connected mailbox (encrypting its tokens) and enqueue an initial
 * backfill. Returns the account id.
 */
export async function linkMailbox(userId: string, input: LinkMailboxInput): Promise<string> {
  await ensureUserKey(userId)
  const crypto = await getUserCrypto(userId)

  const accessTokenCt = input.accessToken ? crypto.encrypt(input.accessToken) : null
  const refreshTokenCt = input.refreshToken ? crypto.encrypt(input.refreshToken) : null

  const accountId = await withUser(userId, async (tx) => {
    const rows = await tx
      .insert(accounts)
      .values({
        userId,
        provider: input.provider,
        email: input.email,
        name: input.name ?? null,
        accessTokenCt,
        refreshTokenCt,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        scopes: input.scopes ?? null,
        syncProgress: 0,
        syncLabel: 'Queued',
      })
      .onConflictDoUpdate({
        target: [accounts.userId, accounts.provider, accounts.email],
        set: {
          accessTokenCt,
          refreshTokenCt,
          tokenExpiresAt: input.tokenExpiresAt ?? null,
          scopes: input.scopes ?? null,
          name: input.name ?? null,
        },
      })
      .returning({ id: accounts.id })
    const row = rows.at(0)
    if (!row) throw new Error('failed to upsert account')
    return row.id
  })

  await enqueueJob(JobQueue.backfill, { userId, accountId, provider: input.provider })
  return accountId
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
