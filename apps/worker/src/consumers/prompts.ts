/**
 * Worker-local AI prompts for the Wave-3 background surfaces.
 *
 * These live here (not in `@revido/core`) because they back worker-only jobs:
 * learning a user's writing voice from their sent mail, mining a thread for
 * follow-ups/commitments, and extracting structured facts during enrichment. All
 * follow the core convention — a STABLE, user-data-free `system` prefix
 * (cache-friendly) with the volatile per-request content in a single user turn.
 */

import type { LlmMessage } from '@revido/core'

export interface WorkerPrompt {
  system: string
  messages: LlmMessage[]
}

const VOICE_PROFILE_SYSTEM = `You are a writing-style analyst for Revido Mail. You are given a set of email messages a person has SENT. Study them and produce a compact, reusable description of how this person writes, so a drafting assistant can later imitate their voice. Capture: typical greeting and sign-off, level of formality, sentence length and rhythm, warmth/directness, use of lists or emoji, and any recurring phrases. Do NOT quote private content, names, companies, or specific facts from the samples — describe STYLE only, never subject matter. Output 4–8 short bullet points of plain text, no preamble.`

/** Build the voice-profile prompt from a user's recent sent-mail bodies. */
export function buildVoiceProfilePrompt(sentBodies: string[]): WorkerPrompt {
  const samples = sentBodies
    .map((b, i) => `<sample index="${i + 1}">\n${b.trim()}\n</sample>`)
    .join('\n\n')
  return {
    system: VOICE_PROFILE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Analyze the writing style across these sent emails and return the style profile.\n\n${samples}`,
      },
    ],
  }
}

const FOLLOW_UP_SYSTEM = `You analyze one email thread for a busy Revido Mail user and surface follow-through items. Return ONLY a JSON object with this exact shape:
{
  "awaitingReply": boolean,        // true iff the USER sent the most recent message and is now waiting on a reply
  "chaserDraft": string | null,    // if awaitingReply, a short, polite follow-up the user could send to chase it; else null
  "commitments": [                 // promises the USER made to the other party ("I'll get back to you Friday")
    { "text": string, "dueAt": string | null }  // dueAt is an ISO 8601 date if a due date is stated/implied, else null
  ]
}
Only include commitments the USER themselves made. If none, use an empty array. Do not add commentary or code fences — output the raw JSON object only.`

/** Build the follow-up / commitment detection prompt over a rendered transcript. */
export function buildFollowUpDetectionPrompt(transcript: string): WorkerPrompt {
  return {
    system: FOLLOW_UP_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Analyze this thread and return the follow-through JSON.\n\n<thread>\n${transcript}\n</thread>`,
      },
    ],
  }
}

const FACT_EXTRACTION_SYSTEM = `You extract STRUCTURED, ACTIONABLE facts from one email thread for a busy Revido Mail user. Return ONLY a JSON object with this exact shape:
{
  "facts": [
    {
      "type": "date" | "amount" | "tracking" | "link" | "action" | "contact",
      "label": string,       // a short human label, e.g. "Payment due", "Order total", "Tracking number"
      "value": string,       // the concrete value, e.g. "2026-08-01", "$249.00", "1Z999AA10123456784"
      "href": string | null  // a URL when the fact is a link/action (unsubscribe, tracking, RSVP); else null
    }
  ]
}
Use these types:
- "date": deadlines, due dates, appointments, meeting/event times.
- "amount": prices, totals, invoice/payment amounts (keep the currency symbol).
- "tracking": shipment/tracking, order, reference, or confirmation numbers.
- "link": an important URL the user may act on — INCLUDING an unsubscribe link.
- "action": a concrete task or request made of the user (attach an href if there's a link to act on).
- "contact": a phone number or email address worth keeping.
Extract ONLY facts EXPLICITLY present in the thread — never guess, infer, or invent a value. When in doubt, leave it out. If the thread contains no such facts, return {"facts": []}. Output the raw JSON object only — no commentary, no code fences.`

/** Build the structured fact-extraction prompt over a rendered transcript. */
export function buildFactExtractionPrompt(subject: string, transcript: string): WorkerPrompt {
  return {
    system: FACT_EXTRACTION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Extract the structured facts from this thread and return the JSON.\n\nSubject: ${subject}\n\n<thread>\n${transcript}\n</thread>`,
      },
    ],
  }
}
