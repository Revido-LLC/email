/**
 * OutlookAdapter — `ProviderAdapter` over Microsoft Graph (v1.0).
 *
 * - backfill: `/me/messages/delta` drained page-by-page via `@odata.nextLink`
 *   (used as the `SyncCursor`); the final page carries the `@odata.deltaLink`.
 * - incremental: GET a stored `deltaLink`; `@removed` items are deletes, the
 *   response's new `@odata.deltaLink` is the next cursor.
 * - send: `createReply` + `send` for replies (Graph sets the threading headers),
 *   `sendMail` for fresh messages.
 * - watch/renew: change-notification subscriptions on `/me/messages` (~3-day
 *   lifetime). The webhook validationToken/clientState handshake is the API's
 *   job, not the adapter's — we only create/renew/delete the subscription and
 *   fetch a starting `deltaLink` for incremental sync.
 *
 * Auth/refresh lives in `connect()`. All calls go through an injectable
 * `fetchImpl` so tests drive the adapter against recorded fixtures.
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
import type { Address } from './mime'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
/** Fields we pull for each message; keeps delta payloads lean. */
const MESSAGE_SELECT =
  'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,body,bodyPreview,hasAttachments,isRead,internetMessageId'

export interface OutlookAdapterOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl
  /** OAuth client credentials for token refresh (never hardcode; pass from env). */
  oauthClientId?: string
  oauthClientSecret?: string
  /** Mailbox owner address — used to classify a message as outbound. */
  userEmail?: string
  /** Webhook URL Graph posts change notifications to (subscription create). */
  notificationUrl?: string
  /** Opaque client-state Graph echoes back for webhook validation. */
  clientState?: string
  /** Messages requested per delta page. */
  backfillPageSize?: number
  /** Clock skew (ms) before an access token is treated as expired. */
  refreshSkewMs?: number
}

interface GraphEmailAddress {
  emailAddress?: { name?: string; address?: string }
}

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  from?: GraphEmailAddress
  sender?: GraphEmailAddress
  toRecipients?: GraphEmailAddress[]
  ccRecipients?: GraphEmailAddress[]
  receivedDateTime?: string
  sentDateTime?: string
  body?: { contentType?: string; content?: string }
  bodyPreview?: string
  hasAttachments?: boolean
  isRead?: boolean
  internetMessageId?: string
  internetMessageHeaders?: { name: string; value: string }[]
  attachments?: { id: string; name?: string; contentType?: string; size?: number }[]
  '@removed'?: { reason?: string }
}

interface GraphDeltaResponse {
  value?: GraphMessage[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

export class OutlookAdapter implements ProviderAdapter {
  readonly provider: Provider = 'outlook'
  private readonly fetchImpl: FetchImpl
  private readonly opts: OutlookAdapterOptions

  constructor(options: OutlookAdapterOptions = {}) {
    this.opts = options
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchImpl)
  }

  async connect(creds: ProviderCredentials): Promise<ProviderCredentials> {
    const skew = this.opts.refreshSkewMs ?? 60_000
    if (Date.parse(creds.expiresAt) - skew > Date.now()) return creds
    if (!creds.refreshToken) return creds
    const clientId = this.opts.oauthClientId ?? process.env.MS_CLIENT_ID
    const clientSecret = this.opts.oauthClientSecret ?? process.env.MS_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('OutlookAdapter.connect: missing OAuth client credentials for token refresh')
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default offline_access',
    })
    const res = await this.fetchImpl(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Outlook token refresh failed (${res.status})`)
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? creds.refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    }
  }

  async backfill(creds: ProviderCredentials, cursor?: SyncCursor): Promise<BackfillPage> {
    const url =
      cursor ??
      `${GRAPH_BASE}/me/messages/delta?$select=${MESSAGE_SELECT}&$top=${this.opts.backfillPageSize ?? 25}`
    const res = await authedJson<GraphDeltaResponse>(this.fetchImpl, creds.accessToken, url)
    const messages = (res.value ?? []).filter((m) => !m['@removed']).map((m) => this.parse(m))
    // More pages → hand back the nextLink; final page → backfill complete. The
    // deltaLink on the final page is (re)acquired by `watch()` to seed incremental.
    return { messages, nextCursor: res['@odata.nextLink'] ?? null }
  }

  async incremental(creds: ProviderCredentials, cursor: SyncCursor): Promise<IncrementalDelta> {
    const upserted: RawFetchedMessage[] = []
    const deleted: string[] = []
    let url: string | undefined = cursor
    let nextCursor = cursor
    do {
      const res: GraphDeltaResponse = await authedJson<GraphDeltaResponse>(
        this.fetchImpl,
        creds.accessToken,
        url,
      )
      for (const m of res.value ?? []) {
        if (m['@removed']) deleted.push(m.id)
        else upserted.push(this.parse(m))
      }
      if (res['@odata.deltaLink']) nextCursor = res['@odata.deltaLink']
      url = res['@odata.nextLink']
    } while (url)
    return { upserted, deletedProviderMessageIds: deleted, nextCursor }
  }

  async getMessage(
    creds: ProviderCredentials,
    providerMessageId: string,
  ): Promise<RawFetchedMessage> {
    const raw = await authedJson<GraphMessage>(
      this.fetchImpl,
      creds.accessToken,
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(providerMessageId)}?$select=${MESSAGE_SELECT}`,
    )
    return this.parse(raw)
  }

  async send(
    creds: ProviderCredentials,
    message: OutboundMessage,
  ): Promise<{ providerMessageId: string }> {
    const recipients = (addrs: Address[] | undefined) =>
      (addrs ?? []).map((a) => ({
        emailAddress: { name: a.name || undefined, address: a.email },
      }))

    if (message.inReplyToProviderMessageId) {
      // Graph builds a reply draft that already carries the threading headers.
      const draft = await authedJson<GraphMessage>(
        this.fetchImpl,
        creds.accessToken,
        `${GRAPH_BASE}/me/messages/${encodeURIComponent(message.inReplyToProviderMessageId)}/createReply`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      await authedJson<void>(
        this.fetchImpl,
        creds.accessToken,
        `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            body: { contentType: 'HTML', content: message.html },
            toRecipients: recipients(message.to),
            ccRecipients: recipients(message.cc),
          }),
        },
      )
      await authedJson<void>(
        this.fetchImpl,
        creds.accessToken,
        `${GRAPH_BASE}/me/messages/${encodeURIComponent(draft.id)}/send`,
        { method: 'POST' },
      )
      return { providerMessageId: draft.id }
    }

    await authedJson<void>(this.fetchImpl, creds.accessToken, `${GRAPH_BASE}/me/sendMail`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: 'HTML', content: message.html },
          toRecipients: recipients(message.to),
          ccRecipients: recipients(message.cc),
          bccRecipients: recipients(message.bcc),
        },
        saveToSentItems: true,
      }),
    })
    // sendMail is fire-and-forget (202, no id); the sent message surfaces on the
    // next delta. Return an empty id so callers can reconcile then.
    return { providerMessageId: '' }
  }

  async watch(creds: ProviderCredentials): Promise<WatchRegistration> {
    if (!this.opts.notificationUrl) {
      throw new Error('OutlookAdapter.watch: notificationUrl is required')
    }
    const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000)
    const sub = await authedJson<{ id: string; expirationDateTime: string }>(
      this.fetchImpl,
      creds.accessToken,
      `${GRAPH_BASE}/subscriptions`,
      {
        method: 'POST',
        body: JSON.stringify({
          changeType: 'created,updated,deleted',
          notificationUrl: this.opts.notificationUrl,
          resource: '/me/messages',
          expirationDateTime: expiration.toISOString(),
          clientState: this.opts.clientState,
        }),
      },
    )
    // Acquire a starting deltaLink so incremental sync has a cursor to advance.
    const cursor = await this.currentDeltaLink(creds)
    return { id: sub.id, expiresAt: sub.expirationDateTime, cursor }
  }

  async renewWatch(
    creds: ProviderCredentials,
    current: WatchRegistration,
  ): Promise<WatchRegistration> {
    const expiration = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000)
    const sub = await authedJson<{ id: string; expirationDateTime: string }>(
      this.fetchImpl,
      creds.accessToken,
      `${GRAPH_BASE}/subscriptions/${encodeURIComponent(current.id)}`,
      { method: 'PATCH', body: JSON.stringify({ expirationDateTime: expiration.toISOString() }) },
    )
    return { id: sub.id, expiresAt: sub.expirationDateTime, cursor: current.cursor }
  }

  async unsubscribe(creds: ProviderCredentials, watch: WatchRegistration): Promise<void> {
    await authedJson<void>(
      this.fetchImpl,
      creds.accessToken,
      `${GRAPH_BASE}/subscriptions/${encodeURIComponent(watch.id)}`,
      { method: 'DELETE' },
    )
  }

  /** Drain the delta stream to its `deltaLink` — the cursor for incremental sync. */
  private async currentDeltaLink(creds: ProviderCredentials): Promise<SyncCursor> {
    let url = `${GRAPH_BASE}/me/messages/delta?$select=id&$top=${this.opts.backfillPageSize ?? 50}`
    // Follow nextLinks until Graph hands back the deltaLink token.
    for (;;) {
      const res: GraphDeltaResponse = await authedJson<GraphDeltaResponse>(
        this.fetchImpl,
        creds.accessToken,
        url,
      )
      if (res['@odata.deltaLink']) return res['@odata.deltaLink']
      if (!res['@odata.nextLink']) return url
      url = res['@odata.nextLink']
    }
  }

  private parse(raw: GraphMessage): RawFetchedMessage {
    return parseGraphMessage(raw, this.opts.userEmail)
  }
}

// ---------- payload parsing ----------

function toAddress(a: GraphEmailAddress | undefined): Address {
  return { name: a?.emailAddress?.name ?? '', email: a?.emailAddress?.address ?? '' }
}

/** Convert a Graph message resource into a `RawFetchedMessage`. */
export function parseGraphMessage(raw: GraphMessage, userEmail?: string): RawFetchedMessage {
  const from = toAddress(raw.from ?? raw.sender)
  const to = (raw.toRecipients ?? []).map(toAddress).filter((a) => a.email)
  const cc = (raw.ccRecipients ?? []).map(toAddress).filter((a) => a.email)

  const contentType = (raw.body?.contentType ?? '').toLowerCase()
  const content = raw.body?.content ?? ''
  const html = contentType === 'html' ? content : ''
  const text = contentType === 'text' ? content : (raw.bodyPreview ?? '')

  const headers: Record<string, string> = {}
  for (const h of raw.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value
  if (raw.internetMessageId) headers['message-id'] = raw.internetMessageId

  const outbound = Boolean(
    userEmail && from.email && from.email.toLowerCase() === userEmail.toLowerCase(),
  )

  return {
    providerMessageId: raw.id,
    providerThreadId: raw.conversationId ?? raw.id,
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject: raw.subject ?? '',
    date: raw.receivedDateTime ?? raw.sentDateTime ?? new Date(0).toISOString(),
    html,
    text,
    outbound,
    headers,
    // Graph delta doesn't inline attachment bodies; a `/messages/{id}/attachments`
    // expansion (when present) is mapped, otherwise the worker fetches lazily.
    attachments: (raw.attachments ?? []).map((a) => ({
      providerAttachmentId: a.id,
      name: a.name ?? '',
      mime: a.contentType ?? 'application/octet-stream',
      size: a.size ?? 0,
    })),
  }
}
