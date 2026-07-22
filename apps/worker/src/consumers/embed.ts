/**
 * `embed` consumer — embed a message body into pgvector for chat RAG.
 *
 * Decrypts the subject + text of one message, embeds `subject\n\nbody` with the
 * multilingual embeddings client (1024-dim, matching `message_embeddings`), and
 * upserts the vector keyed on the message id (idempotent — re-running replaces
 * the row). The vector column is plaintext by necessity (pgvector must index it
 * for ANN search); everything else about the message stays encrypted at rest.
 * The AI call is metered under `ai_embeddings`.
 */

import { EmbeddingsRateLimitError, type EmbeddingsClient } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { EmbedStore, UsageStore } from '../mail/store'
import type { JobConsumer, Logger } from '../queue/runner'
import type { JobStore } from '../queue/store'
import { QUEUE, embedPayload, type EmbedPayload } from '../queue/jobs'

/** Cap embedded text so a huge newsletter doesn't blow the provider's token limit. */
const MAX_EMBED_CHARS = 8_000

/**
 * On a provider rate-limit, defer the job instead of failing it. Bound the number
 * of deferrals so a permanently-throttled key can't churn forever — after the cap
 * the message is left unembedded (chat/search degrade gracefully for that one
 * message; a later re-ingest can re-embed it). At ~1 retry/min this spans ~30 min.
 */
const MAX_EMBED_DEFERRALS = 30
const DEFER_BASE_MS = 60_000
const DEFER_MAX_MS = 10 * 60_000

export interface EmbedDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<EmbedStore, 'getMessageText' | 'upsertMessageEmbedding'> & Pick<UsageStore, 'increment'>
  embeddings: Pick<EmbeddingsClient, 'embed' | 'model'>
  jobs: Pick<JobStore, 'enqueue'>
  now(): Date
  logger?: Pick<Logger, 'info'>
}

export function makeEmbedConsumer(deps: EmbedDeps): JobConsumer {
  return async (payload) => {
    const parsed = embedPayload.parse(payload)
    const { accountId, messageId } = parsed
    const account = await deps.loadAccount(accountId)

    const input = await deps.mail.getMessageText(account.userId, messageId, account.crypto)
    if (!input) return // message vanished between enqueue and run — nothing to embed.

    const text = [input.subject, input.text].filter((s) => s.trim()).join('\n\n').slice(0, MAX_EMBED_CHARS)
    if (!text.trim()) return // empty body — skip (keeps the index free of null vectors).

    let embedding: number[] | undefined
    try {
      ;[embedding] = await deps.embeddings.embed([text], { inputType: 'document' })
    } catch (err) {
      if (err instanceof EmbeddingsRateLimitError) return deferEmbed(deps, parsed, err)
      throw err // real failure — let the runner retry/dead-letter as usual.
    }
    if (!embedding) return

    await deps.mail.upsertMessageEmbedding({
      userId: account.userId,
      messageId,
      embedding,
      model: deps.embeddings.model,
    })
    await deps.mail.increment(account.userId, 'ai_embeddings')
  }
}

/**
 * Re-enqueue this embed for LATER with a capped linear backoff — self-pacing under
 * a throttled provider without dead-lettering or error spam. Succeeds (returns) so
 * the current job is marked done rather than failed. Gives up after the cap.
 */
async function deferEmbed(
  deps: EmbedDeps,
  parsed: EmbedPayload,
  err: EmbeddingsRateLimitError,
): Promise<void> {
  const deferrals = parsed.deferrals ?? 0
  if (deferrals >= MAX_EMBED_DEFERRALS) {
    deps.logger?.info('embed: giving up after repeated rate-limiting; leaving message unembedded', {
      messageId: parsed.messageId,
      deferrals,
    })
    return
  }
  const delay = Math.min(DEFER_MAX_MS, DEFER_BASE_MS * (deferrals + 1))
  const runAt = new Date(deps.now().getTime() + delay)
  await deps.jobs.enqueue(
    QUEUE.embed,
    { accountId: parsed.accountId, messageId: parsed.messageId, deferrals: deferrals + 1 },
    { runAt },
  )
  deps.logger?.info('embed: provider rate-limited; deferring', {
    messageId: parsed.messageId,
    status: err.status,
    deferrals: deferrals + 1,
    delayMs: delay,
  })
}
