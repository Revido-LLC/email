/**
 * AI prompt builders (W5/W6/W7) — provider-agnostic, cache-friendly.
 *
 * Every builder returns a stable system prefix (frozen: no timestamps/user ids,
 * so prompt caching works) plus the volatile per-thread content after the last
 * cache breakpoint. Triage pads the taxonomy+rubric past Haiku's 4096-token
 * minimum cacheable prefix. Filled in by Wave 1 `core-domain`; wired to the
 * Anthropic SDK by the Wave 2 `enrichment` agent.
 *
 * This stub freezes the shared shapes.
 */

import type { CategoryId, OutputLanguage } from '@revido/db'

/** A message block ready to hand to the Anthropic SDK. */
export interface PromptMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface BuiltPrompt {
  /** Frozen, cacheable system prefix. */
  system: string
  messages: PromptMessage[]
}

/** Strict structured-output shape for Haiku triage (category + priority + tldr + language). */
export interface TriageResult {
  category: CategoryId
  priorityScore: number
  priority: 'urgent' | 'high' | 'normal' | 'low'
  tldr: string
  /** BCP-47-ish language tag detected from the message ('en' | 'nl' | ...). */
  language: string
}

export interface OutputLanguageOptions {
  /** User's output-language preference; 'match' echoes the email's language. */
  outputLanguage: OutputLanguage
  /** Detected language of the source content, used when outputLanguage = 'match'. */
  detectedLanguage?: string
}
