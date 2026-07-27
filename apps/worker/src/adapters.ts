/**
 * Provider adapter factory. Mail providers are consumed ONLY through the
 * `@revido/core` adapters (never the provider SDKs directly), so the rest of the
 * worker stays provider-neutral. OAuth client credentials and push topics come
 * from env; per-request access tokens are supplied by the caller.
 */

import { GmailAdapter, OutlookAdapter, type ProviderAdapter } from '@revido/core'
import type { Provider } from '@revido/db'

export type AdapterFactory = (provider: Provider) => ProviderAdapter

const INITIAL_IMPORT_LIMIT = 100

export function createAdapterFactory(env: NodeJS.ProcessEnv = process.env): AdapterFactory {
  const gmail = new GmailAdapter({
    oauthClientId: env.GOOGLE_CLIENT_ID,
    oauthClientSecret: env.GOOGLE_CLIENT_SECRET,
    watchTopic: env.GMAIL_PUBSUB_TOPIC,
    backfillPageSize: INITIAL_IMPORT_LIMIT,
  })
  const outlook = new OutlookAdapter({
    oauthClientId: env.MICROSOFT_CLIENT_ID,
    oauthClientSecret: env.MICROSOFT_CLIENT_SECRET,
    notificationUrl: env.GRAPH_NOTIFICATION_URL,
    clientState: env.GRAPH_CLIENT_STATE,
    backfillPageSize: INITIAL_IMPORT_LIMIT,
  })
  return (provider) => (provider === 'gmail' ? gmail : outlook)
}
