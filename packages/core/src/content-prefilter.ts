// packages/core/src/content-prefilter.ts
/**
 * Deterministic, LLM-free content pre-filter — the free first gate of the hybrid
 * agent-matching pipeline. Given a `content` clause's natural-language value we
 * detect a document type and, from cheap thread text (subject + snippet), decide
 * whether a candidate is worth the paid AI classifier at all. A hard `exclude`
 * drops dunning / payment-failure / phishing mail that shares the billing category
 * with real receipts, so it is never classified and never forwarded. Unknown
 * ('generic') doc types always `pass` (today's behaviour), so non-receipt agents
 * are unchanged.
 */

export type DocType = 'receipt' | 'invoice' | 'contract' | 'shipping' | 'generic'
export type PrefilterVerdict = 'exclude' | 'pass'

/** Cheap, metadata-only text signals (already-decrypted subject + optional snippet). */
export interface PrefilterSignals {
  subject: string
  snippet: string
}

/** Dunning / payment-failure / account-jeopardy phrases — the opposite of a receipt. */
const DUNNING = [
  'past due',
  'past-due',
  'overdue',
  'final notice',
  'suspended',
  'suspend',
  "couldn't be charged",
  'could not be charged',
  'couldn’t be charged',
  'payment failed',
  'failed payment',
  'payment failure',
  'declined',
  'action required',
  'update your payment',
  'update your billing',
  'unpaid',
  'reminder to pay',
  'downgrade',
  'recharge',
  'late payment',
  'billing problem',
]

interface DocTypeRule {
  /** Lower-case phrases in subject/snippet that HARD-exclude the thread. */
  exclude: string[]
}

const REGISTRY: Record<Exclude<DocType, 'generic'>, DocTypeRule> = {
  receipt: { exclude: DUNNING },
  // An invoice legitimately states an amount due; only outright failure/jeopardy excludes.
  invoice: {
    exclude: ['final notice', 'suspended', 'account suspended', 'payment failed', 'declined'],
  },
  contract: { exclude: [] },
  shipping: { exclude: [] },
}

const DETECT: { type: Exclude<DocType, 'generic'>; keys: string[] }[] = [
  { type: 'receipt', keys: ['receipt', 'payment', 'purchase', 'order confirmation'] },
  { type: 'invoice', keys: ['invoice', 'bill', 'amount due', 'statement'] },
  { type: 'contract', keys: ['contract', 'agreement', 'signed', 'signature'] },
  { type: 'shipping', keys: ['shipping', 'shipment', 'tracking', 'delivery', 'shipped'] },
]

/** Detect a known document type from a content-clause value, else 'generic'. */
export function detectDocType(clauseValue: string): DocType {
  const v = clauseValue.toLowerCase()
  for (const { type, keys } of DETECT) {
    if (keys.some((k) => v.includes(k))) return type
  }
  return 'generic'
}

/** Free verdict: 'exclude' hard-drops a candidate; 'pass' sends it to the AI classifier. */
export function prefilterVerdict(signals: PrefilterSignals, docType: DocType): PrefilterVerdict {
  if (docType === 'generic') return 'pass'
  const haystack = `${signals.subject}\n${signals.snippet}`.toLowerCase()
  return REGISTRY[docType].exclude.some((phrase) => haystack.includes(phrase)) ? 'exclude' : 'pass'
}
