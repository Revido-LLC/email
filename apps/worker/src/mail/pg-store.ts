/**
 * PgMailStore — the production {@link MailStore} over raw postgres-js.
 *
 * Content columns (`*_ct`) are written as ciphertext under the account DEK; only
 * queryable metadata (category, priority, language, provider ids, timestamps) is
 * plaintext. All content access runs under `withUser` so GUC RLS scopes it to the
 * owner; service cursor/metering tables run under `asService`.
 *
 * Upserts are idempotent on the natural provider keys — contacts by
 * `(user_id, email)`, threads by `(account_id, provider_thread_id)`, messages by
 * `(account_id, provider_message_id)` — so replaying a fetched page is a no-op.
 */

import type {
  CategoryId,
  DigestBundle,
  OutputLanguage,
  Priority,
  Provider,
  Thread,
} from '@revido/db'
import type { Ciphertext } from '@revido/db/crypto'
import {
  AGENT_ACTION_TYPES,
  parseConditionClause,
  createStorageProvider,
  type AgentActionType,
  type AgentCondition,
  type AgentPlan,
  type RawFetchedMessage,
  type StorageProvider,
} from '@revido/core'
import type { Tx, WorkerDb } from '../db/client'
import { serializeCiphertext, type AccountCrypto } from '../db/accounts'
import { htmlToText, sanitizeHtml } from '../sync/html'
import type {
  ApplySummaryInput,
  ApplyThreadActionInput,
  ApplyTriageInput,
  ChaserSendData,
  Contact,
  CreateCommitmentInput,
  CreateReminderInput,
  DigestData,
  EnabledAgentRef,
  EnqueueApprovalInput,
  ListAgentThreadsOptions,
  ForwardSourceData,
  MailStore,
  MessageTextInput,
  OutboundMessageData,
  PersistTarget,
  PersistedMessage,
  RecordAgentRunInput,
  ResolvedAccountRef,
  SaveBackfillProgressInput,
  SaveCursorInput,
  SaveVoiceProfileInput,
  StoredAgentPlan,
  SyncStateRow,
  ThreadForSummary,
  TriageInput,
  UpsertEmbeddingInput,
} from './store'

/** Newly-ingested threads land here until triage recategorizes them. */
const DEFAULT_CATEGORY: CategoryId = 'fyi'

function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

type DbTimestamp = Date | string

/**
 * postgres-js can return timestamp columns as strings depending on connection
 * and type settings. Keep the store boundary tolerant and expose ISO strings to
 * the rest of the Worker consistently.
 */
function timestampIso(value: DbTimestamp): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`invalid database timestamp: ${String(value)}`)
  return date.toISOString()
}

function attachmentKind(mime: string): 'pdf' | 'image' | 'doc' | 'sheet' | 'zip' | 'other' {
  const m = mime.toLowerCase()
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('image/')) return 'image'
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet'
  if (m.includes('word') || m.includes('opendocument.text') || m === 'application/msword')
    return 'doc'
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) return 'zip'
  return 'other'
}

export class PgMailStore implements MailStore {
  /**
   * `storage` backs large (non-inline) attachments: outbound send resolves an
   * attachment's encrypted `storage_ref_ct` to bytes through it. Injectable for
   * tests; defaults to the env-selected provider (local FS in dev, S3/R2 in prod).
   */
  constructor(
    private readonly db: WorkerDb,
    private readonly storage: StorageProvider = createStorageProvider(),
  ) {}

  // -- sync ------------------------------------------------------------------

  private async upsertContact(sql: Tx, userId: string, contact: Contact): Promise<string> {
    const rows = await sql<{ id: string }[]>`
      insert into contacts (user_id, email, name)
      values (${userId}, ${contact.email}, ${contact.name || null})
      on conflict (user_id, email) do update
        set name = coalesce(nullif(excluded.name, ''), contacts.name),
            updated_at = now()
      returning id
    `
    const id = rows[0]?.id
    if (!id) throw new Error(`failed to upsert contact ${contact.email}`)
    return id
  }

  async persistMessage(target: PersistTarget, msg: RawFetchedMessage): Promise<PersistedMessage> {
    const { userId, accountId, crypto } = target
    const messageDate = new Date(msg.date).toISOString()
    const text = msg.text?.trim() ? msg.text : htmlToText(msg.html)

    return this.db.withUser(userId, async (sql) => {
      const fromContactId = await this.upsertContact(sql, userId, msg.from)

      // Thread: find-or-create by (account_id, provider_thread_id).
      const existingThread = await sql<{ id: string }[]>`
        select id from threads
        where account_id = ${accountId} and provider_thread_id = ${msg.providerThreadId}
        limit 1
      `
      let threadId = existingThread[0]?.id
      const hasAttachments = msg.attachments.length > 0
      if (threadId) {
        await sql`
          update threads
          set last_message_at = greatest(last_message_at, ${messageDate}),
              has_attachments = has_attachments or ${hasAttachments},
              updated_at = now()
          where id = ${threadId}
        `
      } else {
        const inserted = await sql<{ id: string }[]>`
          insert into threads
            (user_id, account_id, provider_thread_id, subject_ct, category,
             priority, priority_score, has_attachments, last_message_at)
          values
            (${userId}, ${accountId}, ${msg.providerThreadId},
             ${serializeCiphertext(crypto.encrypt(msg.subject))}::jsonb, ${DEFAULT_CATEGORY},
             'normal', 0, ${hasAttachments}, ${messageDate})
          returning id
        `
        threadId = inserted[0]?.id
        if (!threadId) throw new Error('failed to insert thread')
      }

      // Message: idempotent on (account_id, provider_message_id).
      const existingMessage = await sql<{ id: string }[]>`
        select id from messages
        where account_id = ${accountId} and provider_message_id = ${msg.providerMessageId}
        limit 1
      `
      const priorMessageId = existingMessage[0]?.id
      if (priorMessageId) {
        return { messageId: priorMessageId, threadId, isNew: false }
      }

      const rawHtmlCt = serializeCiphertext(crypto.encrypt(msg.html))
      const htmlCt = serializeCiphertext(crypto.encrypt(sanitizeHtml(msg.html)))
      const textCt = serializeCiphertext(crypto.encrypt(text))
      const insertedMsg = await sql<{ id: string }[]>`
        insert into messages
          (user_id, thread_id, account_id, provider_message_id, from_contact_id,
           date, raw_html_ct, html_ct, text_ct, outbound)
        values
          (${userId}, ${threadId}, ${accountId}, ${msg.providerMessageId}, ${fromContactId},
           ${messageDate}, ${rawHtmlCt}::jsonb, ${htmlCt}::jsonb, ${textCt}::jsonb, ${msg.outbound})
        returning id
      `
      const messageId = insertedMsg[0]?.id
      if (!messageId) throw new Error('failed to insert message')

      // Participants (sender + recipients) + typed recipients.
      await this.linkParticipant(sql, userId, threadId, fromContactId)
      for (const [kind, list] of [
        ['to', msg.to],
        ['cc', msg.cc ?? []],
      ] as const) {
        for (const contact of list) {
          const contactId = await this.upsertContact(sql, userId, contact)
          await this.linkParticipant(sql, userId, threadId, contactId)
          await sql`
            insert into message_recipients (message_id, contact_id, kind, user_id)
            values (${messageId}, ${contactId}, ${kind}, ${userId})
            on conflict (message_id, contact_id, kind) do nothing
          `
        }
      }

      for (const att of msg.attachments) {
        await sql`
          insert into attachments (user_id, message_id, name, size_bytes, mime, kind)
          values (${userId}, ${messageId}, ${att.name || 'attachment'}, ${att.size},
                  ${att.mime}, ${attachmentKind(att.mime)})
        `
      }

      return { messageId, threadId, isNew: true }
    })
  }

  private async linkParticipant(
    sql: Tx,
    userId: string,
    threadId: string,
    contactId: string,
  ): Promise<void> {
    await sql`
      insert into thread_participants (thread_id, contact_id, user_id)
      values (${threadId}, ${contactId}, ${userId})
      on conflict (thread_id, contact_id) do nothing
    `
  }

  async deleteMessages(userId: string, providerMessageIds: string[]): Promise<void> {
    if (providerMessageIds.length === 0) return
    await this.db.withUser(userId, async (sql) => {
      await sql`delete from messages where provider_message_id in ${sql(providerMessageIds)}`
    })
  }

  async getSyncState(accountId: string): Promise<SyncStateRow | null> {
    const rows = await this.db.asService(
      (sql) => sql<SyncStateRow[]>`
        select history_id as "historyId", delta_link as "deltaLink",
               backfill_cursor as "backfillCursor", backfill_complete as "backfillComplete"
        from sync_state where account_id = ${accountId} limit 1
      `,
    )
    return rows[0] ?? null
  }

  private async resolveProvider(sql: Tx, accountId: string): Promise<string> {
    const rows = await sql<{ provider: string }[]>`
      select provider from accounts where id = ${accountId} limit 1
    `
    const provider = rows[0]?.provider
    if (!provider) throw new Error(`account not found for sync_state: ${accountId}`)
    return provider
  }

  async saveBackfillProgress(input: SaveBackfillProgressInput): Promise<void> {
    await this.db.asService(async (sql) => {
      const provider = await this.resolveProvider(sql, input.accountId)
      await sql`
        insert into sync_state
          (user_id, account_id, provider, backfill_cursor, backfill_complete, last_synced_at)
        values
          (${input.userId}, ${input.accountId}, ${provider}, ${input.backfillCursor},
           ${input.backfillComplete}, now())
        on conflict (account_id) do update set
          backfill_cursor = excluded.backfill_cursor,
          backfill_complete = excluded.backfill_complete,
          last_synced_at = now(),
          updated_at = now()
      `
    })
  }

  async saveCursor(input: SaveCursorInput): Promise<void> {
    await this.db.asService(async (sql) => {
      const provider = await this.resolveProvider(sql, input.accountId)
      await sql`
        insert into sync_state
          (user_id, account_id, provider, history_id, delta_link, subscription_id, last_synced_at)
        values
          (${input.userId}, ${input.accountId}, ${provider}, ${input.historyId ?? null},
           ${input.deltaLink ?? null}, ${input.subscriptionId ?? null}, now())
        on conflict (account_id) do update set
          history_id = coalesce(excluded.history_id, sync_state.history_id),
          delta_link = coalesce(excluded.delta_link, sync_state.delta_link),
          subscription_id = coalesce(excluded.subscription_id, sync_state.subscription_id),
          last_synced_at = now(),
          updated_at = now()
      `
    })
  }

  /**
   * Resolve a connected account by provider + mailbox address. Gmail push
   * envelopes identify the mailbox by `emailAddress` (no account id), so a webhook
   * maps it back here. Case-insensitive on the address; the oldest match wins if a
   * single mailbox is (unusually) linked by more than one user.
   */
  async resolveAccountByEmail(
    provider: Provider,
    email: string,
  ): Promise<ResolvedAccountRef | null> {
    const rows = await this.db.asService(
      (sql) => sql<{ account_id: string; user_id: string }[]>`
        select id as account_id, user_id from accounts
        where provider = ${provider} and lower(email) = lower(${email})
        order by created_at asc
        limit 1
      `,
    )
    const row = rows[0]
    return row ? { accountId: row.account_id, userId: row.user_id } : null
  }

  /** Resolve a connected account by the Graph subscription id persisted on its watch. */
  async resolveAccountBySubscription(subscriptionId: string): Promise<ResolvedAccountRef | null> {
    const rows = await this.db.asService(
      (sql) => sql<{ account_id: string; user_id: string }[]>`
        select account_id, user_id from sync_state
        where subscription_id = ${subscriptionId}
        limit 1
      `,
    )
    const row = rows[0]
    return row ? { accountId: row.account_id, userId: row.user_id } : null
  }

  async setSyncProgress(accountId: string, progress: number, label?: string): Promise<void> {
    await this.db.asService(
      (sql) => sql`
        update accounts
        set sync_progress = ${progress}, sync_label = ${label ?? null}, updated_at = now()
        where id = ${accountId}
      `,
    )
  }

  // -- triage ----------------------------------------------------------------

  async getTriageInput(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<TriageInput | null> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<
        {
          subject_ct: Ciphertext | null
          text_ct: Ciphertext | null
          html_ct: Ciphertext | null
          date: DbTimestamp
          from_name: string | null
          from_email: string | null
        }[]
      >`
        select t.subject_ct, m.text_ct, m.html_ct, m.date,
               fc.name as from_name, fc.email as from_email
        from messages m
        join threads t on t.id = m.thread_id
        left join contacts fc on fc.id = m.from_contact_id
        where m.id = ${messageId}
        limit 1
      `
      const row = rows[0]
      if (!row) return null

      const recipients = await sql<{ name: string | null; email: string | null }[]>`
        select c.name, c.email from message_recipients r
        join contacts c on c.id = r.contact_id
        where r.message_id = ${messageId} and r.kind = 'to'
      `
      const body = row.text_ct
        ? crypto.decrypt(row.text_ct)
        : row.html_ct
          ? htmlToText(crypto.decrypt(row.html_ct))
          : ''
      return {
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        from: { name: row.from_name ?? '', email: row.from_email ?? '' },
        to: recipients.map((r) => ({ name: r.name ?? '', email: r.email ?? '' })),
        body,
        date: timestampIso(row.date),
      }
    })
  }

  async applyTriage(input: ApplyTriageInput): Promise<void> {
    const { userId, threadId, messageId, crypto, result } = input
    await this.db.withUser(userId, async (sql) => {
      await sql`
        update threads set
          category = ${result.category},
          priority = ${result.priority},
          priority_score = ${result.priorityScore},
          tldr_ct = ${serializeCiphertext(crypto.encrypt(result.tldr))}::jsonb,
          language = ${result.language},
          updated_at = now()
        where id = ${threadId}
      `
      await sql`
        update messages set language = ${result.language}, updated_at = now()
        where id = ${messageId}
      `
    })
  }

  // -- usage -----------------------------------------------------------------

  async increment(userId: string, metric: string, delta = 1, period?: string): Promise<void> {
    const bucket = period ?? currentPeriod()
    await this.db.asService(
      (sql) => sql`
        insert into usage_counters (user_id, metric, period, count)
        values (${userId}, ${metric}, ${bucket}, ${delta})
        on conflict (user_id, metric, period) do update
          set count = usage_counters.count + ${delta}, updated_at = now()
      `,
    )
  }

  // -- enrichment ------------------------------------------------------------

  async getThread(
    userId: string,
    threadId: string,
    crypto: AccountCrypto,
  ): Promise<ThreadForSummary | null> {
    return this.db.withUser(userId, async (sql) => {
      const head = await sql<
        {
          subject_ct: Ciphertext | null
          priority: Priority
          language: string | null
          output_language: OutputLanguage
        }[]
      >`
        select t.subject_ct, t.priority, t.language, u.output_language
        from threads t join users u on u.id = t.user_id
        where t.id = ${threadId}
        limit 1
      `
      const row = head[0]
      if (!row) return null
      const messages = await sql<
        {
          text_ct: Ciphertext | null
          html_ct: Ciphertext | null
          date: DbTimestamp
          outbound: boolean
          from_name: string | null
          from_email: string | null
        }[]
      >`
        select m.text_ct, m.html_ct, m.date, m.outbound,
               c.name as from_name, c.email as from_email
        from messages m
        left join contacts c on c.id = m.from_contact_id
        where m.thread_id = ${threadId}
        order by m.date asc
      `
      return {
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        priority: row.priority,
        detectedLanguage: row.language,
        outputLanguage: row.output_language,
        messages: messages.map((m) => ({
          from: { name: m.from_name ?? '', email: m.from_email ?? '' },
          date: timestampIso(m.date),
          outbound: m.outbound,
          body: m.text_ct
            ? crypto.decrypt(m.text_ct)
            : m.html_ct
              ? htmlToText(crypto.decrypt(m.html_ct))
              : '',
        })),
      }
    })
  }

  async applySummary(input: ApplySummaryInput): Promise<void> {
    const { userId, threadId, crypto, summary, facts } = input
    await this.db.withUser(userId, async (sql) => {
      await sql`
        update threads set summary_ct = ${serializeCiphertext(crypto.encrypt(summary))}::jsonb, updated_at = now()
        where id = ${threadId}
      `
      await sql`delete from extracted_facts where thread_id = ${threadId}`
      let position = 0
      for (const fact of facts) {
        await sql`
          insert into extracted_facts
            (user_id, thread_id, type, label_ct, value_ct, href_ct, position)
          values
            (${userId}, ${threadId}, ${fact.type},
             ${serializeCiphertext(crypto.encrypt(fact.label))}::jsonb,
             ${serializeCiphertext(crypto.encrypt(fact.value))}::jsonb,
             ${fact.href ? serializeCiphertext(crypto.encrypt(fact.href)) : null}::jsonb,
             ${position})
        `
        position += 1
      }
    })
  }

  // -- send ------------------------------------------------------------------

  async getOutboundMessage(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<OutboundMessageData | null> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<
        {
          thread_id: string
          subject_ct: Ciphertext | null
          html_ct: Ciphertext | null
          text_ct: Ciphertext | null
        }[]
      >`
        select m.thread_id, t.subject_ct, m.html_ct, m.text_ct
        from messages m join threads t on t.id = m.thread_id
        where m.id = ${messageId} and m.outbound = true
        limit 1
      `
      const row = rows[0]
      if (!row) return null

      const recipients = await sql<{ email: string | null; name: string | null; kind: string }[]>`
        select c.email, c.name, r.kind from message_recipients r
        join contacts c on c.id = r.contact_id
        where r.message_id = ${messageId}
      `
      const byKind = (kind: string): Contact[] =>
        recipients
          .filter((r) => r.kind === kind)
          .map((r) => ({ name: r.name ?? '', email: r.email ?? '' }))

      const parent = await sql<{ provider_message_id: string | null }[]>`
        select provider_message_id from messages
        where thread_id = ${row.thread_id} and outbound = false and provider_message_id is not null
        order by date desc limit 1
      `
      const inReplyTo = parent[0]?.provider_message_id ?? undefined

      // Attachments linked to this message. Inline ones carry base64 bytes in
      // `content_ct`; larger ones carry an encrypted object ref in `storage_ref_ct`
      // that resolves to bytes via the StorageProvider. Both kinds end up in the
      // `attachments` array handed to `adapter.send`.
      const attachmentRows = await sql<
        {
          name: string
          mime: string | null
          content_ct: Ciphertext | null
          storage_ref_ct: Ciphertext | null
        }[]
      >`
        select name, mime, content_ct, storage_ref_ct from attachments
        where message_id = ${messageId}
          and (content_ct is not null or storage_ref_ct is not null)
      `
      const attachments = await Promise.all(
        attachmentRows.map(async (a) => ({
          name: a.name,
          mime: a.mime ?? 'application/octet-stream',
          content: a.content_ct
            ? new Uint8Array(Buffer.from(crypto.decrypt(a.content_ct), 'base64'))
            : await this.storage.get(crypto.decrypt(a.storage_ref_ct!)),
        })),
      )

      return {
        to: byKind('to'),
        cc: byKind('cc'),
        bcc: byKind('bcc'),
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        html: row.html_ct ? crypto.decrypt(row.html_ct) : '',
        text: row.text_ct ? crypto.decrypt(row.text_ct) : '',
        inReplyToProviderMessageId: inReplyTo,
        attachments: attachments.length ? attachments : undefined,
      }
    })
  }

  async markSent(userId: string, messageId: string, providerMessageId: string): Promise<void> {
    await this.db.withUser(userId, async (sql) => {
      await sql`
        update messages set provider_message_id = ${providerMessageId}, updated_at = now()
        where id = ${messageId}
      `
    })
  }

  async getForwardSource(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<ForwardSourceData | null> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<
        { subject_ct: Ciphertext | null; html_ct: Ciphertext | null; text_ct: Ciphertext | null }[]
      >`
        select t.subject_ct, m.html_ct, m.text_ct
        from messages m join threads t on t.id = m.thread_id
        where m.id = ${messageId}
        limit 1
      `
      const row = rows[0]
      if (!row) return null

      // Same inline/object-store attachment decryption as the outbound path.
      const attachmentRows = await sql<
        {
          name: string
          mime: string | null
          content_ct: Ciphertext | null
          storage_ref_ct: Ciphertext | null
        }[]
      >`
        select name, mime, content_ct, storage_ref_ct from attachments
        where message_id = ${messageId}
          and (content_ct is not null or storage_ref_ct is not null)
      `
      const attachments = await Promise.all(
        attachmentRows.map(async (a) => ({
          name: a.name,
          mime: a.mime ?? 'application/octet-stream',
          content: a.content_ct
            ? new Uint8Array(Buffer.from(crypto.decrypt(a.content_ct), 'base64'))
            : await this.storage.get(crypto.decrypt(a.storage_ref_ct!)),
        })),
      )

      return {
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        html: row.html_ct ? crypto.decrypt(row.html_ct) : '',
        text: row.text_ct ? crypto.decrypt(row.text_ct) : '',
        attachments: attachments.length ? attachments : undefined,
      }
    })
  }

  // -- embeddings (RAG) ------------------------------------------------------

  async getMessageText(
    userId: string,
    messageId: string,
    crypto: AccountCrypto,
  ): Promise<MessageTextInput | null> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<
        { subject_ct: Ciphertext | null; text_ct: Ciphertext | null; html_ct: Ciphertext | null }[]
      >`
        select t.subject_ct, m.text_ct, m.html_ct
        from messages m join threads t on t.id = m.thread_id
        where m.id = ${messageId}
        limit 1
      `
      const row = rows[0]
      if (!row) return null
      return {
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        text: decryptBody(crypto, row.text_ct, row.html_ct),
      }
    })
  }

  async upsertMessageEmbedding(input: UpsertEmbeddingInput): Promise<void> {
    const literal = `[${input.embedding.join(',')}]`
    await this.db.withUser(input.userId, async (sql) => {
      await sql`
        insert into message_embeddings (message_id, user_id, embedding, model)
        values (${input.messageId}, ${input.userId}, ${literal}::vector, ${input.model})
        on conflict (message_id) do update
          set embedding = excluded.embedding, model = excluded.model
      `
    })
  }

  // -- voice profile ---------------------------------------------------------

  async getSentBodies(userId: string, crypto: AccountCrypto, limit: number): Promise<string[]> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<{ text_ct: Ciphertext | null; html_ct: Ciphertext | null }[]>`
        select m.text_ct, m.html_ct
        from messages m
        where m.outbound = true
        order by m.date desc
        limit ${limit}
      `
      return rows.map((r) => decryptBody(crypto, r.text_ct, r.html_ct)).filter((b) => b.length > 0)
    })
  }

  async saveVoiceProfile(input: SaveVoiceProfileInput): Promise<void> {
    // users is Better-Auth-owned; write voice_profile as the service role.
    const ct = serializeCiphertext(input.crypto.encrypt(input.profile))
    await this.db.asService(
      (sql) => sql`
        update users set voice_profile_ct = ${ct}::jsonb, updated_at = now()
        where id = ${input.userId}
      `,
    )
  }

  // -- agents ----------------------------------------------------------------

  async listNewMailAgents(userId: string): Promise<EnabledAgentRef[]> {
    return this.db.asService(
      (sql) => sql<EnabledAgentRef[]>`
        select id from agents
        where user_id = ${userId} and enabled = true and trigger = 'new-mail'
        order by created_at asc
      `,
    )
  }

  async getAgentPlan(userId: string, agentId: string): Promise<StoredAgentPlan | null> {
    return this.db.withUser(userId, async (sql) => {
      const heads = await sql<
        {
          name: string
          icon: string | null
          trigger: string | null
          conditions: string[]
          trusted: boolean
        }[]
      >`
        select name, icon, trigger, conditions, trusted from agents where id = ${agentId} limit 1
      `
      const head = heads[0]
      if (!head) return null
      const actionRows = await sql<
        { type: string; label: string; params: Record<string, string> | null }[]
      >`
        select type, label, params from agent_actions where agent_id = ${agentId} order by position asc
      `
      return {
        name: head.name,
        icon: head.icon,
        trusted: head.trusted,
        plan: reconstructPlan(head.trigger, head.conditions, actionRows),
      }
    })
  }

  async listAgentThreads(
    userId: string,
    crypto: AccountCrypto,
    opts: ListAgentThreadsOptions = {},
  ): Promise<Thread[]> {
    const limit = opts.limit ?? 200
    const ids = opts.threadIds
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<ThreadMetaRow[]>`
        select t.id, t.account_id, t.subject_ct, t.category, t.priority, t.priority_score,
               t.unread, t.starred, t.snoozed_until, t.has_attachments, t.awaiting_reply,
               t.labels, t.language, t.last_message_at
        from threads t
        where ${ids && ids.length > 0 ? sql`t.id in ${sql(ids)}` : sql`true`}
        order by t.last_message_at desc
        limit ${limit}
      `
      if (rows.length === 0) return []
      const threadIds = rows.map((r) => r.id)
      const parts = await sql<{ thread_id: string; name: string | null; email: string | null }[]>`
        select tp.thread_id, c.name, c.email
        from thread_participants tp join contacts c on c.id = tp.contact_id
        where tp.thread_id in ${sql(threadIds)}
      `
      const byThread = new Map<string, Contact[]>()
      for (const p of parts) {
        const list = byThread.get(p.thread_id) ?? []
        list.push({ name: p.name ?? '', email: p.email ?? '' })
        byThread.set(p.thread_id, list)
      }

      // Latest INBOUND message id per thread — the message a `forward` action
      // acts on. Without this, `thread.messageIds` would be empty and a forward
      // rule could never resolve a source message.
      const latest = await sql<{ thread_id: string; id: string }[]>`
        select distinct on (thread_id) thread_id, id
        from messages
        where thread_id in ${sql(threadIds)} and outbound = false
        order by thread_id, date desc
      `
      const latestByThread = new Map<string, string>()
      for (const m of latest) latestByThread.set(m.thread_id, m.id)

      return rows.map((r) =>
        toDomainThreadMeta(r, crypto, byThread.get(r.id) ?? [], latestByThread.get(r.id)),
      )
    })
  }

  async applyThreadAction(input: ApplyThreadActionInput): Promise<void> {
    const { userId, threadId, type } = input
    await this.db.withUser(userId, async (sql) => {
      switch (type) {
        case 'star':
          await sql`update threads set starred = true, updated_at = now() where id = ${threadId}`
          return
        case 'mark-read':
          await sql`update threads set unread = false, updated_at = now() where id = ${threadId}`
          return
        case 'label':
        case 'archive': {
          // No `archived` column exists — archive is modeled as an 'archived' label.
          const label = type === 'archive' ? 'archived' : (input.label ?? '').trim()
          if (!label) return
          await sql`
            update threads
            set labels = (
              select array(select distinct unnest(array_append(labels, ${label})))
            ), updated_at = now()
            where id = ${threadId}
          `
          return
        }
      }
    })
  }

  async enqueueApproval(input: EnqueueApprovalInput): Promise<void> {
    const { userId, crypto } = input
    const params = input.params ? JSON.stringify(input.params) : null
    await this.db.withUser(userId, async (sql) => {
      await sql`
        insert into approvals
          (user_id, agent_id, agent_name, agent_icon, action, thread_id, message_id,
           subject_ct, sender, preview_ct, params)
        values
          (${userId}, ${input.agentId}, ${input.agentName}, ${input.agentIcon}, ${input.action},
           ${input.threadId}, ${input.messageId ?? null},
           ${serializeCiphertext(crypto.encrypt(input.subject))}::jsonb,
           ${input.sender}, ${serializeCiphertext(crypto.encrypt(input.preview))}::jsonb,
           ${params}::jsonb)
      `
    })
  }

  async recordAgentRun(input: RecordAgentRunInput): Promise<void> {
    const { userId, crypto } = input
    const affectedJson = JSON.stringify(input.affected)
    await this.db.withUser(userId, async (sql) => {
      await sql`
        insert into agent_runs
          (user_id, agent_id, agent_name, agent_icon, at, summary_ct, reasoning_ct,
           affected_ct, status, reversible)
        values
          (${userId}, ${input.agentId}, ${input.agentName}, ${input.agentIcon}, ${input.at.toISOString()},
           ${serializeCiphertext(crypto.encrypt(input.summary))}::jsonb,
           ${serializeCiphertext(crypto.encrypt(input.reasoning))}::jsonb,
           ${serializeCiphertext(crypto.encrypt(affectedJson))}::jsonb,
           ${input.status}, ${input.reversible})
      `
    })
  }

  // -- reminders / commitments -----------------------------------------------

  async createReminder(input: CreateReminderInput): Promise<void> {
    const { userId, crypto } = input
    await this.db.withUser(userId, async (sql) => {
      await sql`
        insert into reminders
          (user_id, kind, thread_id, subject_ct, context_ct, sender, due_at, draft_reply_ct)
        values
          (${userId}, ${input.kind}, ${input.threadId},
           ${serializeCiphertext(crypto.encrypt(input.subject))}::jsonb,
           ${serializeCiphertext(crypto.encrypt(input.context))}::jsonb,
           ${input.sender}, ${input.dueAt.toISOString()},
           ${input.draftReply ? serializeCiphertext(crypto.encrypt(input.draftReply)) : null}::jsonb)
      `
    })
  }

  async createCommitment(input: CreateCommitmentInput): Promise<void> {
    const { userId, crypto } = input
    await this.db.withUser(userId, async (sql) => {
      await sql`
        insert into commitments (user_id, text_ct, thread_id, subject_ct, counterpart, due_at)
        values
          (${userId}, ${serializeCiphertext(crypto.encrypt(input.text))}::jsonb, ${input.threadId},
           ${serializeCiphertext(crypto.encrypt(input.subject))}::jsonb, ${input.counterpart},
           ${input.dueAt.toISOString()})
      `
    })
  }

  // -- chaser ----------------------------------------------------------------

  async getChaserSendData(
    userId: string,
    reminderId: string,
    crypto: AccountCrypto,
  ): Promise<ChaserSendData | null> {
    return this.db.withUser(userId, async (sql) => {
      const rows = await sql<
        {
          thread_id: string | null
          subject_ct: Ciphertext | null
          draft_reply_ct: Ciphertext | null
        }[]
      >`
        select thread_id, subject_ct, draft_reply_ct from reminders where id = ${reminderId} limit 1
      `
      const row = rows[0]
      if (!row || !row.thread_id) return null
      const draft = row.draft_reply_ct ? crypto.decrypt(row.draft_reply_ct) : ''
      if (!draft) return null

      const threadRows = await sql<{ account_id: string }[]>`
        select account_id from threads where id = ${row.thread_id} limit 1
      `
      const accountId = threadRows[0]?.account_id
      if (!accountId) return null

      // The follow-up goes to whoever we last emailed in this thread (and are
      // now chasing) — the recipients of the most recent outbound message.
      const lastOut = await sql<{ id: string; provider_message_id: string | null }[]>`
        select id, provider_message_id from messages
        where thread_id = ${row.thread_id} and outbound = true
        order by date desc limit 1
      `
      const to: Contact[] = []
      let inReplyTo: string | undefined
      const out = lastOut[0]
      if (out) {
        inReplyTo = out.provider_message_id ?? undefined
        const recips = await sql<{ name: string | null; email: string | null }[]>`
          select c.name, c.email from message_recipients r
          join contacts c on c.id = r.contact_id
          where r.message_id = ${out.id} and r.kind = 'to'
        `
        for (const rc of recips) to.push({ name: rc.name ?? '', email: rc.email ?? '' })
      }
      if (to.length === 0) return null

      const subject = row.subject_ct ? crypto.decrypt(row.subject_ct) : ''
      return {
        accountId,
        to,
        subject,
        html: draft,
        text: htmlToText(draft),
        inReplyToProviderMessageId: inReplyTo,
      }
    })
  }

  async deleteReminder(userId: string, reminderId: string): Promise<void> {
    await this.db.withUser(userId, async (sql) => {
      await sql`delete from reminders where id = ${reminderId}`
    })
  }

  // -- digest ----------------------------------------------------------------

  async getDigestData(userId: string, crypto: AccountCrypto): Promise<DigestData> {
    return this.db.withUser(userId, async (sql) => {
      const userRows = await sql<
        { email: string; name: string | null; output_language: OutputLanguage }[]
      >`select email, name, output_language from users where id = ${userId} limit 1`
      const user = userRows[0]

      const counts = await sql<{ category: CategoryId; count: number }[]>`
        select category, count(*)::int as count
        from threads where unread = true group by category
      `
      const samples = await sql<
        {
          id: string
          category: CategoryId
          subject_ct: Ciphertext | null
          sender_name: string | null
          sender_email: string | null
        }[]
      >`
        select t.id, t.category, t.subject_ct,
          (select c.name from messages m join contacts c on c.id = m.from_contact_id
             where m.thread_id = t.id order by m.date desc limit 1) as sender_name,
          (select c.email from messages m join contacts c on c.id = m.from_contact_id
             where m.thread_id = t.id order by m.date desc limit 1) as sender_email
        from threads t
        where t.unread = true and t.category = 'to-reply'
        order by t.priority_score desc, t.last_message_at desc
        limit 3
      `
      const itemsByCategory = new Map<
        CategoryId,
        { threadId: string; subject: string; sender: string }[]
      >()
      for (const s of samples) {
        const list = itemsByCategory.get(s.category) ?? []
        list.push({
          threadId: s.id,
          subject: s.subject_ct ? crypto.decrypt(s.subject_ct) : '(no subject)',
          sender: s.sender_name || s.sender_email || 'Unknown',
        })
        itemsByCategory.set(s.category, list)
      }
      const bundles: DigestBundle[] = counts
        .filter((c) => c.count > 0)
        .map((c) => ({
          category: c.category,
          count: c.count,
          items: itemsByCategory.get(c.category) ?? [],
        }))

      const reminderRows = await sql<
        {
          thread_id: string
          subject_ct: Ciphertext | null
          sender: string | null
          due_at: DbTimestamp
        }[]
      >`select thread_id, subject_ct, sender, due_at from reminders order by due_at asc limit 3`
      const reminders = reminderRows.map((r) => ({
        threadId: r.thread_id,
        subject: r.subject_ct ? crypto.decrypt(r.subject_ct) : '(no subject)',
        sender: r.sender ?? '',
        dueAt: timestampIso(r.due_at),
      }))

      const commitmentRows = await sql<
        {
          thread_id: string
          text_ct: Ciphertext | null
          counterpart: string | null
          due_at: DbTimestamp
        }[]
      >`select thread_id, text_ct, counterpart, due_at from commitments order by due_at asc limit 3`
      const commitments = commitmentRows.map((r) => ({
        threadId: r.thread_id,
        text: r.text_ct ? crypto.decrypt(r.text_ct) : '',
        counterpart: r.counterpart ?? '',
        dueAt: timestampIso(r.due_at),
      }))

      const handled = await sql<{ count: number }[]>`
        select count(*)::int as count from agent_runs
        where at >= now() - interval '1 day' and status = 'done'
      `

      return {
        email: user?.email ?? '',
        name: user?.name ?? null,
        outputLanguage: user?.output_language ?? 'match',
        bundles,
        reminders,
        commitments,
        agentsHandled: handled[0]?.count ?? 0,
      }
    })
  }
}

/** Row shape for {@link PgMailStore.listAgentThreads}. */
interface ThreadMetaRow {
  id: string
  account_id: string
  subject_ct: Ciphertext | null
  category: CategoryId
  priority: Priority
  priority_score: number
  unread: boolean
  starred: boolean
  snoozed_until: DbTimestamp | null
  has_attachments: boolean
  awaiting_reply: boolean
  labels: string[]
  language: string | null
  last_message_at: DbTimestamp
}

/** Decrypt the text body, falling back to the sanitized HTML if there's no text part. */
function decryptBody(
  crypto: AccountCrypto,
  textCt: Ciphertext | null,
  htmlCt: Ciphertext | null,
): string {
  if (textCt) return crypto.decrypt(textCt)
  if (htmlCt) return htmlToText(crypto.decrypt(htmlCt))
  return ''
}

/** Map a thread metadata row into the domain {@link Thread} the predicate reads. */
function toDomainThreadMeta(
  row: ThreadMetaRow,
  crypto: AccountCrypto,
  participants: Contact[],
  latestInboundMessageId?: string,
): Thread {
  return {
    id: row.id,
    accountId: row.account_id,
    subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
    participants,
    category: row.category,
    priority: row.priority,
    priorityScore: row.priority_score,
    tldr: '',
    summary: '',
    unread: row.unread,
    starred: row.starred,
    snoozedUntil: row.snoozed_until ? timestampIso(row.snoozed_until) : null,
    hasAttachments: row.has_attachments,
    badges: [],
    extracted: [],
    messageIds: latestInboundMessageId ? [latestInboundMessageId] : [],
    lastMessageAt: timestampIso(row.last_message_at),
    awaitingReply: row.awaiting_reply,
    labels: row.labels,
    language: row.language ?? undefined,
  }
}

/**
 * Rebuild an {@link AgentPlan} from an agent's stored (plaintext) config.
 *
 * `agents.conditions` is a `text[]` of `"field op value"` clauses (the same string
 * shown in the UI); `parseConditionClause` is the exact inverse of the api's
 * `serializeConditionClause`, so conditions round-trip into machine predicates. An
 * unparseable clause is dropped. Actions come from `agent_actions` (ordered),
 * keeping only recognized action types and carrying their `params` (e.g. a forward
 * destination) through to the runtime.
 */
function reconstructPlan(
  trigger: string | null,
  conditions: string[],
  actions: { type: string; label: string; params: Record<string, string> | null }[],
): AgentPlan {
  const parsedConditions: AgentCondition[] = []
  for (const clause of conditions) {
    const parsed = parseConditionClause(clause)
    if (parsed) parsedConditions.push(parsed)
  }
  const known = new Set<string>(AGENT_ACTION_TYPES)
  const planActions = actions
    .filter((a) => known.has(a.type))
    .map((a) => ({
      type: a.type as AgentActionType,
      label: a.label,
      ...(a.params ? { params: a.params } : {}),
    }))
  return {
    trigger: trigger === 'scheduled' ? 'scheduled' : 'new-mail',
    conditions: parsedConditions,
    actions: planActions,
  }
}
