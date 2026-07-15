/**
 * Canned AI draft scenarios for the composer. The prompt bar picks a scenario by
 * keyword and streams the `default` tone; the tone chips re-stream a variant.
 * Everything here is mock content — the "AI" is a scripted, word-by-word reveal.
 */

export type ToneKey = 'default' | 'shorter' | 'friendlier' | 'formal'

export interface ToneVariants {
  default: string[]
  shorter: string[]
  friendlier: string[]
  formal: string[]
}

export interface DraftScenario {
  id: string
  /** Lowercase substrings that route a prompt to this scenario. */
  keywords: string[]
  /** Suggested subject, used to prefill an empty Subject field. */
  subject: string
  tone: ToneVariants
}

export const DRAFT_SCENARIOS: DraftScenario[] = [
  {
    id: 'intro',
    keywords: [
      'intro',
      'lead',
      'project',
      'inbound',
      'nimbus',
      'priya',
      'yes',
      'proposal to',
      'new client',
    ],
    subject: 'Re: New project — internal ops tool',
    tone: {
      default: [
        'Hi Priya,',
        "Thanks so much for reaching out — it means a lot that Brightfoundry's work stood out to you.",
        "The internal ops tool you described is right in our wheelhouse, and yes, we're taking on a couple of new projects this quarter.",
        'Would you be open to a 30-minute call next week to walk through what you have in mind? I can then put together a rough scope and timeline.',
        'Excited to potentially work together.',
      ],
      shorter: [
        'Hi Priya,',
        "Thanks for reaching out — the ops tool is right up our alley, and yes, we're taking new projects this quarter.",
        'Free for a 30-minute call next week to dig into the details?',
      ],
      friendlier: [
        'Hi Priya!',
        'Thank you so much for thinking of us — this genuinely made my day.',
        "The internal ops tool sounds like such a fun build, and it's squarely in our wheelhouse. Happily, we've got room for a couple of new projects this quarter!",
        "Want to grab 30 minutes next week? I'd love to hear the full vision and sketch out a scope with you.",
        'Really looking forward to it!',
      ],
      formal: [
        'Dear Priya,',
        "Thank you for reaching out, and for your kind words about Brightfoundry's work.",
        'The internal operations tool you describe aligns well with our expertise, and we do have capacity for select new engagements this quarter.',
        'I would welcome the opportunity to schedule a 30-minute call next week to discuss your requirements, after which I can prepare a preliminary scope and timeline.',
        'I look forward to the possibility of working together.',
      ],
    },
  },
  {
    id: 'followup',
    keywords: [
      'follow',
      'chase',
      'nudge',
      'remind',
      'circle back',
      'check in',
      'checking in',
      'no reply',
    ],
    subject: 'Following up',
    tone: {
      default: [
        'Hi there,',
        'I wanted to follow up on the proposal I sent over last week — I know inboxes get busy, so no worries at all if it slipped through.',
        "Whenever you have a moment, I'd love to hear your thoughts, and I'm happy to hop on a quick call if that's easier.",
        'Looking forward to hearing from you.',
      ],
      shorter: [
        'Hi there,',
        'Just floating my proposal back to the top of your inbox — would love your thoughts whenever you get a chance.',
        "Happy to jump on a quick call if that's easier.",
      ],
      friendlier: [
        'Hey!',
        "Hope your week's going well! I just wanted to gently circle back on the proposal I sent — totally get how quickly inboxes pile up.",
        "No rush at all, but I'd genuinely love to hear what you think. And if a quick call sounds easier, I'm all yours.",
        'Chat soon!',
      ],
      formal: [
        'Dear colleague,',
        'I am writing to follow up regarding the proposal I submitted last week for your review.',
        'At your earliest convenience, I would appreciate any feedback you may have. I remain available should you wish to discuss the details by phone.',
        'Thank you for your time and consideration.',
      ],
    },
  },
]

/** Route a free-text prompt to the best-matching scenario (defaults to follow-up). */
export function pickScenario(prompt: string): DraftScenario {
  const p = prompt.toLowerCase()
  const match = DRAFT_SCENARIOS.find((s) => s.keywords.some((k) => p.includes(k)))
  return match ?? DRAFT_SCENARIOS[DRAFT_SCENARIOS.length - 1]!
}

export function findScenario(id: string | null): DraftScenario {
  return DRAFT_SCENARIOS.find((s) => s.id === id) ?? DRAFT_SCENARIOS[DRAFT_SCENARIOS.length - 1]!
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function totalWords(paragraphs: string[]): number {
  return paragraphs.reduce((n, p) => n + p.trim().split(/\s+/).length, 0)
}

/** Build the HTML for a partially-revealed draft (first `revealed` words). */
export function buildDraftHtml(paragraphs: string[], revealed: number): string {
  let remaining = revealed
  const out: string[] = []
  for (const p of paragraphs) {
    if (remaining <= 0) break
    const words = p.trim().split(/\s+/)
    const take = Math.min(words.length, remaining)
    out.push(`<p>${escapeHtml(words.slice(0, take).join(' '))}</p>`)
    remaining -= words.length
  }
  return out.join('')
}
