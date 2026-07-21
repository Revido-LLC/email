import type { AgentDef, CategoryId, Thread } from '@revido/db'
import type { AgentActionType, AgentPlan } from '@revido/core'

/**
 * A tiny mock "compiler" that turns a plain-English description into a
 * structured agent plan. It keys off words in the text — this is deliberately
 * simple; the point is to make the trust-building flow (plan → dry-run) feel
 * real without a backend.
 */

export interface CompiledAction {
  label: string
  needsApproval: boolean
}

export interface CompiledPlan {
  suggestedName: string
  icon: string
  accent: string
  trigger: string
  conditions: string[]
  actions: CompiledAction[]
  /** Category the dry-run matches against. */
  category: CategoryId
  /** Human phrase for the match, e.g. "in Receipts". */
  matchLabel: string
  /** Predicate used with dryRunMatch() over the last 30 days of mail. */
  predicate: (t: Thread) => boolean
}

interface Rule {
  keywords: string[]
  build: () => CompiledPlan
}

const RULES: Rule[] = [
  {
    keywords: ['invoice', 'receipt', 'expense', 'bill', 'accounting', 'payment'],
    build: () => ({
      suggestedName: 'Invoice Filer',
      icon: 'Receipt',
      accent: 'receipts',
      trigger: 'New mail arrives',
      conditions: ['Contains an invoice or receipt', 'Has an amount'],
      actions: [
        { label: 'Label Receipts', needsApproval: false },
        { label: 'File by month', needsApproval: false },
      ],
      category: 'receipts',
      matchLabel: 'in Receipts',
      predicate: (t) => t.category === 'receipts',
    }),
  },
  {
    keywords: ['newsletter', 'digest', 'substack', 'reading', 'bundle'],
    build: () => ({
      suggestedName: 'Newsletter Tamer',
      icon: 'Newspaper',
      accent: 'newsletters',
      trigger: 'Daily at 7am',
      conditions: ['Category is Newsletters', 'Priority is low'],
      actions: [
        { label: 'Bundle into digest', needsApproval: false },
        { label: 'Archive originals', needsApproval: false },
      ],
      category: 'newsletters',
      matchLabel: 'in Newsletters',
      predicate: (t) => t.category === 'newsletters',
    }),
  },
  {
    keywords: ['follow', 'chase', 'nudge', 'no reply', 'no-reply', 'remind', 'waiting', 'chaser'],
    build: () => ({
      suggestedName: 'Follow-up Chaser',
      icon: 'Send',
      accent: 'awaiting-reply',
      trigger: 'Nightly at 9pm',
      conditions: ['Sent by you', 'No reply in 4+ days', 'Was a question or ask'],
      actions: [
        { label: 'Draft chaser', needsApproval: false },
        { label: 'Send chaser', needsApproval: true },
      ],
      category: 'awaiting-reply',
      matchLabel: 'awaiting a reply',
      predicate: (t) => t.awaitingReply,
    }),
  },
  {
    keywords: ['meeting', 'calendar', 'prep', 'agenda', 'briefing'],
    build: () => ({
      suggestedName: 'Meeting Prep',
      icon: 'CalendarClock',
      accent: 'calendar',
      trigger: '30 min before calendar events',
      conditions: ['Event has external attendees'],
      actions: [{ label: 'Draft prep brief', needsApproval: false }],
      category: 'calendar',
      matchLabel: 'on your calendar',
      predicate: (t) => t.category === 'calendar',
    }),
  },
  {
    keywords: ['notification', 'mute', 'silence', 'alert', 'noise'],
    build: () => ({
      suggestedName: 'Notification Muter',
      icon: 'BellOff',
      accent: 'notifications',
      trigger: 'New mail arrives',
      conditions: ['Category is Notifications'],
      actions: [
        { label: 'Mark as read', needsApproval: false },
        { label: 'Bundle quietly', needsApproval: false },
      ],
      category: 'notifications',
      matchLabel: 'in Notifications',
      predicate: (t) => t.category === 'notifications',
    }),
  },
]

function defaultPlan(): CompiledPlan {
  return {
    suggestedName: 'Priority Sorter',
    icon: 'Sparkles',
    accent: 'to-reply',
    trigger: 'New mail arrives',
    conditions: ['Looks like it needs a reply', 'From a real person'],
    actions: [
      { label: 'Label To Reply', needsApproval: false },
      { label: 'Surface in Needs You', needsApproval: false },
    ],
    category: 'to-reply',
    matchLabel: 'that need a reply',
    predicate: (t) => t.category === 'to-reply',
  }
}

/** Optional extra actions layered on when the description mentions them. */
const AUGMENTS: { keyword: string; action: CompiledAction }[] = [
  { keyword: 'fyi', action: { label: 'Mark FYI', needsApproval: false } },
  { keyword: 'archive', action: { label: 'Archive', needsApproval: false } },
  { keyword: 'star', action: { label: 'Star', needsApproval: false } },
  { keyword: 'unsubscribe', action: { label: 'Unsubscribe', needsApproval: true } },
  { keyword: 'forward', action: { label: 'Forward to accounting', needsApproval: true } },
]

export function compilePlan(description: string): CompiledPlan {
  const text = description.toLowerCase()
  const rule = RULES.find((r) => r.keywords.some((k) => text.includes(k)))
  const plan = rule ? rule.build() : defaultPlan()

  for (const { keyword, action } of AUGMENTS) {
    if (text.includes(keyword) && !plan.actions.some((a) => a.label === action.label)) {
      plan.actions = [...plan.actions, action]
    }
  }

  return plan
}

export function planNeedsApproval(plan: CompiledPlan): boolean {
  return plan.actions.some((a) => a.needsApproval)
}

/** Build a plan from an existing agent def (for the "review before enable" flow). */
export function planFromAgent(agent: AgentDef): CompiledPlan {
  const awaiting = agent.accent === 'awaiting-reply'
  const category = (agent.accent as CategoryId) ?? 'fyi'
  return {
    suggestedName: agent.name,
    icon: agent.icon,
    accent: agent.accent,
    trigger: agent.trigger,
    conditions: agent.conditions,
    actions: agent.actions.map((a) => ({ label: a.label, needsApproval: a.needsApproval })),
    category,
    matchLabel: awaiting ? 'awaiting a reply' : `in ${labelFor(category)}`,
    predicate: awaiting ? (t) => t.awaitingReply : (t) => t.category === category,
  }
}

function labelFor(category: CategoryId): string {
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** The forward destination of a real API plan's forward action, or null. */
export function forwardActionTo(plan: AgentPlan): string | null {
  const fwd = plan.actions.find((a) => a.type === 'forward')
  const to = fwd?.params?.to?.trim()
  return to ? to : null
}

/** Whether a real API plan forwards mail (drives the "auto-forward" toggle). */
export function planHasForward(plan: AgentPlan): boolean {
  return plan.actions.some((a) => a.type === 'forward')
}

/**
 * Adapt a real (server-compiled) `AgentPlan` into the wizard's display shape so
 * the existing plan/dry-run UI can render it. The category is taken from a
 * `category is X` clause when present (for an accurate preview); otherwise the
 * preview is permissive. The submitted plan is the real one, not this display.
 */
export function planToDisplay(plan: AgentPlan, suggestedName: string): CompiledPlan {
  const categoryClause = plan.conditions.find((c) => c.field.toLowerCase() === 'category')
  const category = (categoryClause?.value as CategoryId) ?? 'fyi'
  const scheduled = plan.trigger === 'scheduled'
  const conditions = plan.conditions.map((c) => `${c.field} ${c.op} ${c.value}`)
  return {
    suggestedName,
    icon: planHasForward(plan) ? 'Send' : 'Tag',
    accent: category,
    trigger: scheduled ? (plan.schedule ?? 'On a schedule') : 'New mail arrives',
    conditions: conditions.length ? conditions : ['Every message'],
    actions: plan.actions.map((a) => ({
      label: a.label,
      needsApproval: CONSEQUENTIAL.has(a.type),
    })),
    category,
    matchLabel: categoryClause ? `in ${labelFor(category)}` : 'across your inbox',
    predicate: categoryClause ? (t) => t.category === category : () => true,
  }
}

const CONSEQUENTIAL = new Set<AgentActionType>(['send', 'unsubscribe', 'delete', 'forward'])

/** Best-effort map a human action label to a structured plan action type. */
function actionType(label: string): AgentActionType {
  const l = label.toLowerCase()
  if (l.includes('unsubscribe')) return 'unsubscribe'
  if (l.includes('forward')) return 'forward'
  if (l.includes('delete')) return 'delete'
  if (l.includes('send')) return 'send'
  if (l.includes('archive')) return 'archive'
  if (l.includes('draft')) return 'draft'
  if (l.includes('star')) return 'star'
  if (l.includes('read')) return 'mark-read'
  return 'label'
}

/**
 * Lower the UI's `CompiledPlan` onto the API's `AgentPlan` shape for
 * `POST /agents`. The client compile stays a preview; the server persists this.
 */
export function toAgentPlan(plan: CompiledPlan): AgentPlan {
  const scheduled = !/new mail/i.test(plan.trigger)
  return {
    trigger: scheduled ? 'scheduled' : 'new-mail',
    ...(scheduled ? { schedule: plan.trigger } : {}),
    conditions: [{ field: 'category', op: 'is', value: plan.category }],
    actions: plan.actions.map((a) => ({ type: actionType(a.label), label: a.label })),
  }
}
