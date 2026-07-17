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

import type { CategoryId, OutputLanguage, Priority } from '@revido/db'
import type { Ciphertext } from '@revido/db/crypto'
import type { RawFetchedMessage } from '@revido/core'
import type { Tx, WorkerDb } from '../db/client'
import { jsonCiphertext, type AccountCrypto } from '../db/accounts'
import { htmlToText, sanitizeHtml } from '../sync/html'
import type {
  ApplySummaryInput,
  ApplyTriageInput,
  Contact,
  MailStore,
  OutboundMessageData,
  PersistTarget,
  PersistedMessage,
  SaveBackfillProgressInput,
  SaveCursorInput,
  SyncStateRow,
  ThreadForSummary,
  TriageInput,
} from './store'

/** Newly-ingested threads land here until triage recategorizes them. */
const DEFAULT_CATEGORY: CategoryId = 'fyi'

function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function attachmentKind(mime: string): 'pdf' | 'image' | 'doc' | 'sheet' | 'zip' | 'other' {
  const m = mime.toLowerCase()
  if (m === 'application/pdf') return 'pdf'
  if (m.startsWith('image/')) return 'image'
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'sheet'
  if (m.includes('word') || m.includes('opendocument.text') || m === 'application/msword') return 'doc'
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) return 'zip'
  return 'other'
}

export class PgMailStore implements MailStore {
  constructor(private readonly db: WorkerDb) {}

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
    const messageDate = new Date(msg.date)
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
             ${sql.json(jsonCiphertext(crypto.encrypt(msg.subject)))}, ${DEFAULT_CATEGORY},
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

      const rawHtmlCt = sql.json(jsonCiphertext(crypto.encrypt(msg.html)))
      const htmlCt = sql.json(jsonCiphertext(crypto.encrypt(sanitizeHtml(msg.html))))
      const textCt = sql.json(jsonCiphertext(crypto.encrypt(text)))
      const insertedMsg = await sql<{ id: string }[]>`
        insert into messages
          (user_id, thread_id, account_id, provider_message_id, from_contact_id,
           date, raw_html_ct, html_ct, text_ct, outbound)
        values
          (${userId}, ${threadId}, ${accountId}, ${msg.providerMessageId}, ${fromContactId},
           ${messageDate}, ${rawHtmlCt}, ${htmlCt}, ${textCt}, ${msg.outbound})
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
          (user_id, account_id, provider, history_id, delta_link, last_synced_at)
        values
          (${input.userId}, ${input.accountId}, ${provider}, ${input.historyId ?? null},
           ${input.deltaLink ?? null}, now())
        on conflict (account_id) do update set
          history_id = coalesce(excluded.history_id, sync_state.history_id),
          delta_link = coalesce(excluded.delta_link, sync_state.delta_link),
          last_synced_at = now(),
          updated_at = now()
      `
    })
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
          date: Date
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
        date: row.date.toISOString(),
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
          tldr_ct = ${sql.json(jsonCiphertext(crypto.encrypt(result.tldr)))},
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
          date: Date
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
          date: m.date.toISOString(),
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
        update threads set summary_ct = ${sql.json(jsonCiphertext(crypto.encrypt(summary)))}, updated_at = now()
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
             ${sql.json(jsonCiphertext(crypto.encrypt(fact.label)))},
             ${sql.json(jsonCiphertext(crypto.encrypt(fact.value)))},
             ${fact.href ? sql.json(jsonCiphertext(crypto.encrypt(fact.href))) : null},
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

      return {
        to: byKind('to'),
        cc: byKind('cc'),
        bcc: byKind('bcc'),
        subject: row.subject_ct ? crypto.decrypt(row.subject_ct) : '',
        html: row.html_ct ? crypto.decrypt(row.html_ct) : '',
        text: row.text_ct ? crypto.decrypt(row.text_ct) : '',
        inReplyToProviderMessageId: inReplyTo,
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
}
