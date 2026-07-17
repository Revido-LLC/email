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

import type { EmbeddingsClient } from '@revido/core'
import type { AccountContext } from '../db/accounts'
import type { EmbedStore, UsageStore } from '../mail/store'
import type { JobConsumer } from '../queue/runner'
import { embedPayload } from '../queue/jobs'

/** Cap embedded text so a huge newsletter doesn't blow the provider's token limit. */
const MAX_EMBED_CHARS = 8_000

export interface EmbedDeps {
  loadAccount(accountId: string): Promise<AccountContext>
  mail: Pick<EmbedStore, 'getMessageText' | 'upsertMessageEmbedding'> & Pick<UsageStore, 'increment'>
  embeddings: Pick<EmbeddingsClient, 'embed' | 'model'>
}

export function makeEmbedConsumer(deps: EmbedDeps): JobConsumer {
  return async (payload) => {
    const { accountId, messageId } = embedPayload.parse(payload)
    const account = await deps.loadAccount(accountId)

    const input = await deps.mail.getMessageText(account.userId, messageId, account.crypto)
    if (!input) return // message vanished between enqueue and run — nothing to embed.

    const text = [input.subject, input.text].filter((s) => s.trim()).join('\n\n').slice(0, MAX_EMBED_CHARS)
    if (!text.trim()) return // empty body — skip (keeps the index free of null vectors).

    const [embedding] = await deps.embeddings.embed([text], { inputType: 'document' })
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
