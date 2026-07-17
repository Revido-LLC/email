/**
 * ProviderAdapter — the provider-agnostic mail interface (W3/W4).
 *
 * Two implementations land in Wave 1 (`core-domain`): `GmailAdapter` (Gmail API
 * + Pub/Sub `watch` + `history.list`) and `OutlookAdapter` (Graph +
 * change-notification subscriptions + `delta`), tested against recorded
 * fixtures. api + worker consume this interface only — never provider SDKs
 * directly — so the rest of the system stays provider-neutral.
 *
 * This stub freezes the method surface so the sync/worker agents can build
 * against it in parallel.
 */

import type { Provider } from '@revido/db'

/** Opaque provider sync cursor (Gmail historyId, Graph deltaLink). */
export type SyncCursor = string

/** A normalized message as returned by an adapter, before encryption at rest. */
export interface RawFetchedMessage {
  providerMessageId: string
  providerThreadId: string
  from: { name: string; email: string }
  to: { name: string; email: string }[]
  cc?: { name: string; email: string }[]
  subject: string
  date: string
  /** Raw HTML body (pre-sanitization). */
  html: string
  text: string
  outbound: boolean
  headers: Record<string, string>
  attachments: { providerAttachmentId: string; name: string; mime: string; size: number }[]
}

export interface BackfillPage {
  messages: RawFetchedMessage[]
  /** Cursor to fetch the next (older) page, or null when the backfill is complete. */
  nextCursor: SyncCursor | null
}

export interface IncrementalDelta {
  upserted: RawFetchedMessage[]
  deletedProviderMessageIds: string[]
  nextCursor: SyncCursor
}

/** A file to attach to an outbound message (decrypted bytes, ready to encode). */
export interface OutboundAttachment {
  name: string
  mime: string
  /** Raw attachment bytes; each adapter base64-encodes for its own wire format. */
  content: Uint8Array
}

export interface OutboundMessage {
  to: { name: string; email: string }[]
  cc?: { name: string; email: string }[]
  bcc?: { name: string; email: string }[]
  subject: string
  html: string
  text: string
  /** For replies: the provider message id being replied to (threading headers). */
  inReplyToProviderMessageId?: string
  /** Files to attach — MIME `multipart/mixed` (Gmail) / Graph fileAttachment (Outlook). */
  attachments?: OutboundAttachment[]
}

export interface WatchRegistration {
  /** Provider-specific subscription/watch id. */
  id: string
  /** When the watch/subscription expires and must be renewed. */
  expiresAt: string
  cursor: SyncCursor
}

/** OAuth tokens for a connected account (decrypted just-in-time). */
export interface ProviderCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

export interface ProviderAdapter {
  readonly provider: Provider
  /** Exchange/refresh credentials as needed; returns fresh access token state. */
  connect(creds: ProviderCredentials): Promise<ProviderCredentials>
  /** Newest-first progressive import. */
  backfill(creds: ProviderCredentials, cursor?: SyncCursor): Promise<BackfillPage>
  /** Apply a push-notified delta (Gmail history.list / Graph delta). */
  incremental(creds: ProviderCredentials, cursor: SyncCursor): Promise<IncrementalDelta>
  getMessage(creds: ProviderCredentials, providerMessageId: string): Promise<RawFetchedMessage>
  send(creds: ProviderCredentials, message: OutboundMessage): Promise<{ providerMessageId: string }>
  /** Register/refresh push notifications; returns the new expiry + cursor. */
  watch(creds: ProviderCredentials): Promise<WatchRegistration>
  renewWatch(creds: ProviderCredentials, current: WatchRegistration): Promise<WatchRegistration>
  unsubscribe(creds: ProviderCredentials, watch: WatchRegistration): Promise<void>
}
