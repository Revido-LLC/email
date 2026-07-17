/**
 * @revido/core — shared, provider-agnostic domain logic.
 *
 * The ProviderAdapter interface, AI prompt builders, the agent-plan schema, and
 * language utilities. Consumed by `apps/api` and `apps/worker`.
 */

export * from './provider-adapter'
export * from './prompts'
export * from './agent-plan'
export * from './language'
export * from './llm'
export * from './embeddings'

// Concrete provider adapters + their fetch-injection plumbing.
export { GmailAdapter, parseGmailMessage } from './adapters/gmail'
export type { GmailAdapterOptions } from './adapters/gmail'
export { OutlookAdapter, parseGraphMessage } from './adapters/outlook'
export type { OutlookAdapterOptions } from './adapters/outlook'
export { ProviderHttpError } from './adapters/http'
export type { FetchImpl } from './adapters/http'
export {
  buildRfc822,
  formatAddress,
  parseAddress,
  parseAddressList,
  encodeBase64Url,
  decodeBase64Url,
} from './adapters/mime'
export type { Address } from './adapters/mime'
