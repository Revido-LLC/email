/**
 * Content-free product analytics (PostHog).
 *
 * Two hard guarantees, by construction:
 *
 *  1. **Opt-in / no-op by default.** Nothing initializes unless `VITE_POSTHOG_KEY`
 *     is set. With no key (dev, CI, self-host without analytics) every function
 *     here is an inert no-op — no network, no cookies, no PostHog at all.
 *  2. **No message content, ever.** DOM autocapture and pageview capture are OFF,
 *     session recording is disabled, and text/attributes are masked — so PostHog
 *     can never scrape an email subject, body, address, or anything a user typed.
 *     Events are only the fixed set in {@link AnalyticsEventMap}, and their props
 *     are metadata only (ids, counts, categories, enum-like surface/source tags).
 *     The typed allowlist is the guardrail: `capture()` accepts nothing else.
 *
 * Users are identified by opaque id only — never email or name (see
 * {@link identifyUser}).
 */
import posthog from 'posthog-js'

const POSTHOG_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST: string | undefined = import.meta.env.VITE_POSTHOG_HOST

/** Flipped on only after a successful, keyed `init`. Gates every call below. */
let enabled = false

/**
 * The complete set of events this app may emit, each with its content-free
 * property shape. Adding an event means adding it here first — that is the point.
 *
 * Every property is metadata: an id, a count, a category token, or an enum-like
 * `source`/`surface`/`cta` tag. NEVER a subject, body, email address, contact
 * name, search query, or any free text the user entered.
 */
export interface AnalyticsEventMap {
  /** Landing-page activation CTA (wow → sign-in / talk-to-sales). */
  landing_cta_clicked: { cta: 'oauth-google' | 'oauth-microsoft' | 'talk' }
  /** Reached the end of onboarding (activation), with how many agents were kept on. */
  onboarding_completed: { agentsEnabled: number }
  /** "Talk to Revido" lead form submitted (no field values — just the fact). */
  lead_submitted: undefined
  /** A user created an agent, tagged by where they created it. */
  agent_created: { source: 'onboarding' | 'agents' }
  /** A question was sent to the AI assistant (the query text is NOT included). */
  chat_query_sent: { surface: 'assistant' | 'command' }
}

/** A permitted event name. */
export type AnalyticsEvent = keyof AnalyticsEventMap

/**
 * Initialize PostHog. Safe to call once at startup; a no-op when
 * `VITE_POSTHOG_KEY` is unset or when already initialized.
 */
export function initAnalytics(): void {
  if (enabled || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST ?? 'https://us.i.posthog.com',
    // Only spin up a person profile once we identify by id; anonymous landing /
    // onboarding events never create one.
    person_profiles: 'identified_only',
    // The content firewall: no DOM autocapture, no URL/pageview capture, no replay.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    // Belt-and-suspenders — if recording were ever turned on upstream, mask it all.
    mask_all_text: true,
    mask_all_element_attributes: true,
  })
  enabled = true
}

/**
 * Record a content-free product event. No-op unless analytics is initialized.
 * The event name and prop shape are both constrained by {@link AnalyticsEventMap},
 * so a caller cannot smuggle message content through here.
 */
export function capture<E extends AnalyticsEvent>(event: E, props?: AnalyticsEventMap[E]): void {
  if (!enabled) return
  posthog.capture(event, props ?? undefined)
}

/**
 * Associate subsequent events with a user by **opaque id only**. Never pass an
 * email, name, or any other identifier — id is the whole point.
 */
export function identifyUser(userId: string): void {
  if (!enabled) return
  posthog.identify(userId)
}

/** Clear the identified user (call on sign-out). No-op when uninitialized. */
export function resetAnalytics(): void {
  if (!enabled) return
  posthog.reset()
}
