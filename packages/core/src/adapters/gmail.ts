/**
 * GmailAdapter — `ProviderAdapter` over the Gmail REST API (v1).
 *
 * - backfill: `users.messages.list` (newest-first) + per-message `get`, paged by
 *   the list `pageToken` (used as the `SyncCursor`).
 * - incremental: `users.history.list` from a `historyId` cursor.
 * - send: raw RFC 822 (`messages.send`) with `In-Reply-To`/`References` derived
 *   from the parent message, plus the Gmail `threadId` so the reply threads.
 * - watch/renew: `users.watch` against a Pub/Sub topic (7-day expiry); the
 *   returned `historyId` seeds incremental sync.
 * - unsubscribe: `users.stop` tears the watch down.
 *
 * Auth/refresh lives in `connect()`; every other method takes fresh credentials.
 * All network calls go through an injectable `fetchImpl` so tests can drive the
 * adapter against recorded fixtures with no real Gmail account.
 */

import type { Provider } from '@revido/db'
import type {
  BackfillPage,
  IncrementalDelta,
  OutboundMessage,
  ProviderAdapter,
  ProviderCredentials,
  RawFetchedMessage,
  SyncCursor,
  WatchRegistration,
} from '../provider-adapter'
import { authedJson, type FetchImpl } from './http'
import {
  buildRfc822,
  decodeBase64Url,
  encodeBase64Url,
  parseAddress,
  parseAddressList,
} from './mime'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface GmailAdapterOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl
  /** OAuth client credentials for token refresh (never hardcode; pass from env). */
  oauthClientId?: string
  oauthClientSecret?: string
  /** Cloud Pub/Sub topic for `users.watch`, e.g. `projects/<p>/topics/<t>`. */
  watchTopic?: string
  /** Label filter for watch/backfill; defaults to the whole mailbox. */
  labelIds?: string[]
  /** Messages requested per backfill page. */
  backfillPageSize?: number
  /** Clock skew (ms) before an access token is treated as expired. */
  refreshSkewMs?: number
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPayload {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPayload[]
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPayload
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[]
  nextPageToken?: string
}

interface GmailHistoryResponse {
  history?: {
    messagesAdded?: { message: { id: string; threadId: string } }[]
    messagesDeleted?: { message: { id: string; threadId: string } }[]
  }[]
  historyId?: string
  nextPageToken?: string
}

export class GmailAdapter implements ProviderAdapter {
  readonly provider: Provider = 'gmail'
  private readonly fetchImpl: FetchImpl
  private readonly opts: GmailAdapterOptions

  constructor(options: GmailAdapterOptions = {}) {
    this.opts = options
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchImpl)
  }

  async connect(creds: ProviderCredentials): Promise<ProviderCredentials> {
    const skew = this.opts.refreshSkewMs ?? 60_000
    if (Date.parse(creds.expiresAt) - skew > Date.now()) return creds
    if (!creds.refreshToken) return creds
    const clientId = this.opts.oauthClientId ?? process.env.GOOGLE_CLIENT_ID
    const clientSecret = this.opts.oauthClientSecret ?? process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('GmailAdapter.connect: missing OAuth client credentials for token refresh')
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
    const res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Gmail token refresh failed (${res.status})`)
    const json = (await res.json()) as { access_token: string; expires_in: number }
    return {
      accessToken: json.access_token,
      refreshToken: creds.refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    }
  }

  async backfill(creds: ProviderCredentials, cursor?: SyncCursor): Promise<BackfillPage> {
    const params = new URLSearchParams({
      maxResults: String(this.opts.backfillPageSize ?? 25),
    })
    for (const label of this.opts.labelIds ?? []) params.append('labelIds', label)
    if (cursor) params.set('pageToken', cursor)
    const list = await authedJson<GmailListResponse>(
      this.fetchImpl,
      creds.accessToken,
      `${GMAIL_BASE}/messages?${params.toString()}`,
    )
    const ids = list.messages ?? []
    const messages = await Promise.all(ids.map((m) => this.getMessage(creds, m.id)))
    return { messages, nextCursor: list.nextPageToken ?? null }
  }

  async incremental(creds: ProviderCredentials, cursor: SyncCursor): Promise<IncrementalDelta> {
    const upsertedIds = new Set<string>()
    const deleted = new Set<string>()
    let pageToken: string | undefined
    let latestHistoryId = cursor
    do {
      const params = new URLSearchParams({ startHistoryId: cursor })
      params.append('historyTypes', 'messageAdded')
      params.append('historyTypes', 'messageDeleted')
      if (pageToken) params.set('pageToken', pageToken)
      const res = await authedJson<GmailHistoryResponse>(
        this.fetchImpl,
        creds.accessToken,
        `${GMAIL_BASE}/history?${params.toString()}`,
      )
      for (const h of res.history ?? []) {
        for (const a of h.messagesAdded ?? []) upsertedIds.add(a.message.id)
        for (const d of h.messagesDeleted ?? []) deleted.add(d.message.id)
      }
      if (res.historyId) latestHistoryId = res.historyId
      pageToken = res.nextPageToken
    } while (pageToken)

    // A message added then deleted within the window is a net delete.
    for (const id of deleted) upsertedIds.delete(id)
    const upserted = await Promise.all([...upsertedIds].map((id) => this.getMessage(creds, id)))
    return {
      upserted,
      deletedProviderMessageIds: [...deleted],
      nextCursor: latestHistoryId,
    }
  }

  async getMessage(
    creds: ProviderCredentials,
    providerMessageId: string,
  ): Promise<RawFetchedMessage> {
    const raw = await authedJson<GmailMessage>(
      this.fetchImpl,
      creds.accessToken,
      `${GMAIL_BASE}/messages/${encodeURIComponent(providerMessageId)}?format=full`,
    )
    return parseGmailMessage(raw)
  }

  async send(
    creds: ProviderCredentials,
    message: OutboundMessage,
  ): Promise<{ providerMessageId: string }> {
    let inReplyTo: string | undefined
    let references: string | undefined
    let threadId: string | undefined
    if (message.inReplyToProviderMessageId) {
      const parent = await this.getMessage(creds, message.inReplyToProviderMessageId)
      inReplyTo = headerOf(parent.headers, 'message-id')
      references = headerOf(parent.headers, 'references')
      threadId = parent.providerThreadId
    }
    const rfc822 = buildRfc822({
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      html: message.html,
      text: message.text,
      inReplyTo,
      references,
    })
    const payload: { raw: string; threadId?: string } = { raw: encodeBase64Url(rfc822) }
    if (threadId) payload.threadId = threadId
    const sent = await authedJson<{ id: string }>(
      this.fetchImpl,
      creds.accessToken,
      `${GMAIL_BASE}/messages/send`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
    return { providerMessageId: sent.id }
  }

  async watch(creds: ProviderCredentials): Promise<WatchRegistration> {
    if (!this.opts.watchTopic) {
      throw new Error('GmailAdapter.watch: watchTopic (Pub/Sub topic) is required')
    }
    const res = await authedJson<{ historyId: string; expiration: string }>(
      this.fetchImpl,
      creds.accessToken,
      `${GMAIL_BASE}/watch`,
      {
        method: 'POST',
        body: JSON.stringify({
          topicName: this.opts.watchTopic,
          labelIds: this.opts.labelIds ?? ['INBOX'],
          labelFilterBehavior: 'INCLUDE',
        }),
      },
    )
    return {
      // Gmail has one watch per mailbox; key it by topic for idempotent renew.
      id: this.opts.watchTopic,
      // `expiration` is epoch millis as a string.
      expiresAt: new Date(Number(res.expiration)).toISOString(),
      cursor: res.historyId,
    }
  }

  async renewWatch(
    creds: ProviderCredentials,
    _current: WatchRegistration,
  ): Promise<WatchRegistration> {
    // Re-issuing `users.watch` extends the 7-day window; Gmail is idempotent.
    return this.watch(creds)
  }

  async unsubscribe(creds: ProviderCredentials, _watch: WatchRegistration): Promise<void> {
    await authedJson<void>(this.fetchImpl, creds.accessToken, `${GMAIL_BASE}/stop`, {
      method: 'POST',
    })
  }
}

// ---------- payload parsing ----------

/** Convert a Gmail `format=full` message into a `RawFetchedMessage`. */
export function parseGmailMessage(raw: GmailMessage): RawFetchedMessage {
  const headerList = raw.payload?.headers ?? []
  const headers: Record<string, string> = {}
  for (const h of headerList) headers[h.name.toLowerCase()] = h.value

  const from = parseAddress(headers['from'] ?? '')
  const to = parseAddressList(headers['to'])
  const cc = parseAddressList(headers['cc'])

  const collected = { html: '', text: '', attachments: [] as RawFetchedMessage['attachments'] }
  if (raw.payload) walkParts(raw.payload, collected)

  const labelIds = raw.labelIds ?? []
  const dateHeader = headers['date']
  const date = dateHeader
    ? new Date(dateHeader).toISOString()
    : raw.internalDate
      ? new Date(Number(raw.internalDate)).toISOString()
      : new Date(0).toISOString()

  return {
    providerMessageId: raw.id,
    providerThreadId: raw.threadId,
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject: headers['subject'] ?? '',
    date,
    html: collected.html,
    text: collected.text,
    outbound: labelIds.includes('SENT'),
    headers,
    attachments: collected.attachments,
  }
}

function walkParts(
  part: GmailPayload,
  out: { html: string; text: string; attachments: RawFetchedMessage['attachments'] },
): void {
  const mime = part.mimeType ?? ''
  const isAttachment = Boolean(part.filename) && Boolean(part.body?.attachmentId)
  if (isAttachment) {
    out.attachments.push({
      providerAttachmentId: part.body!.attachmentId!,
      name: part.filename ?? '',
      mime: mime || 'application/octet-stream',
      size: part.body?.size ?? 0,
    })
    return
  }
  if (part.parts?.length) {
    for (const child of part.parts) walkParts(child, out)
    return
  }
  const data = part.body?.data
  if (!data) return
  const decoded = decodeBase64Url(data)
  if (mime === 'text/html' && !out.html) out.html = decoded
  else if (mime === 'text/plain' && !out.text) out.text = decoded
  else if (mime === 'text/html') out.html += decoded
  else if (mime === 'text/plain') out.text += decoded
}

function headerOf(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()]
}
