/**
 * Append-only audit trail + audited decrypt seam.
 *
 * `audit_log` is write-once (RLS + trigger forbid UPDATE/DELETE; only the service
 * role appends). {@link appendAuditLog} is the single writer every sensitive
 * action goes through.
 *
 * Decrypt policy: a decrypt inside the direct authenticated user-request path is
 * self-authorizing (the caller is reading their OWN mailbox under RLS) and is not
 * audited — auditing every self-read would bury the signal. Any decrypt OUTSIDE
 * that path — a break-glass/support action, or a service decrypting on a user's
 * behalf — MUST be audited: {@link breakGlassDecrypt} is that gate. It records an
 * append-only `decrypt` row (actor + reason) and only then hands back the crypto.
 *
 * `metadata` is non-sensitive context ONLY (never plaintext content) — mirrors the
 * `audit_log` schema contract in `packages/db/schema/system.ts`.
 */
import { asService, type DbTransaction } from '@revido/db/client'
import { auditLog } from '@revido/db/schema'
import { getUserCrypto, type UserCrypto } from './crypto'

/** One append-only audit row. `metadata` must stay free of plaintext content. */
export interface AuditEntry {
  /** Whose data the action touched (nullable for pre-provision actions). */
  userId: string | null
  /** Who acted: `"user"`, a service name, an operator id, or an agent id. */
  actor: string
  /** Action verb, e.g. `"decrypt"`, `"send"`, `"key.purge"`. */
  action: string
  resourceType?: string
  resourceId?: string
  /** Non-sensitive structured context (plaintext, no message content). */
  metadata?: Record<string, unknown>
}

/**
 * Append one audit row. Pass `tx` to write inside an existing service transaction
 * (so the audit + the audited mutation commit atomically); omit it to open a
 * dedicated `asService` transaction.
 */
export async function appendAuditLog(entry: AuditEntry, tx?: DbTransaction): Promise<void> {
  const values = {
    userId: entry.userId,
    actor: entry.actor,
    action: entry.action,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? null,
  }
  if (tx) {
    await tx.insert(auditLog).values(values)
    return
  }
  await asService(async (t) => {
    await t.insert(auditLog).values(values)
  })
}

/** Context for a {@link breakGlassDecrypt}, recorded verbatim onto the audit row. */
export interface BreakGlassContext {
  /** The operator/service performing the out-of-band decrypt (never `"user"`). */
  actor: string
  /** Human-readable justification, persisted to the audit trail. */
  reason: string
  resourceType?: string
  resourceId?: string
}

/**
 * Load a user's crypto for a decrypt OUTSIDE the authenticated user-request path
 * (support break-glass, service-on-behalf-of). Writes an append-only `decrypt`
 * audit row FIRST — so the access is recorded even if the caller then throws —
 * then returns the {@link UserCrypto}.
 */
export async function breakGlassDecrypt(
  userId: string,
  ctx: BreakGlassContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UserCrypto> {
  await appendAuditLog({
    userId,
    actor: ctx.actor,
    action: 'decrypt',
    resourceType: ctx.resourceType ?? 'user',
    resourceId: ctx.resourceId ?? userId,
    metadata: { reason: ctx.reason, path: 'break-glass' },
  })
  return getUserCrypto(userId, env)
}
