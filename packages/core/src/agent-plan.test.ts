import { describe, expect, it } from 'vitest'
import type { Thread } from '@revido/db'
import {
  actionNeedsApproval,
  agentActionSchema,
  agentConditionSchema,
  agentPlanSchema,
  compilePredicate,
  contentClauses,
  CONTENT_FIELD,
  forwardDestination,
  planRequiresApproval,
  type AgentPlan,
} from './agent-plan'

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'th-1',
    accountId: 'acc-1',
    subject: 'Invoice #4471 from Shop',
    participants: [{ name: 'Billing', email: 'billing@shop.example' }],
    category: 'receipts',
    priority: 'normal',
    priorityScore: 40,
    tldr: '',
    summary: '',
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: true,
    badges: [],
    extracted: [],
    messageIds: ['m-1'],
    lastMessageAt: '2024-07-16T00:00:00Z',
    awaitingReply: false,
    labels: ['finance', 'q3'],
    ...overrides,
  }
}

const plan = (
  conditions: AgentPlan['conditions'],
  actions: AgentPlan['actions'] = [],
): AgentPlan => ({
  trigger: 'new-mail',
  conditions,
  actions,
})

describe('compilePredicate', () => {
  it('matches on category equality (the common case)', () => {
    const match = compilePredicate(plan([{ field: 'category', op: 'is', value: 'receipts' }]))
    expect(match(makeThread())).toBe(true)
    expect(match(makeThread({ category: 'newsletters' }))).toBe(false)
  })

  it('ANDs multiple conditions', () => {
    const match = compilePredicate(
      plan([
        { field: 'category', op: 'is', value: 'receipts' },
        { field: 'hasAttachments', op: 'is', value: 'true' },
      ]),
    )
    expect(match(makeThread())).toBe(true)
    expect(match(makeThread({ hasAttachments: false }))).toBe(false)
  })

  it('supports is-not, contains, and not-contains over strings', () => {
    expect(
      compilePredicate(plan([{ field: 'category', op: 'is-not', value: 'promotions' }]))(
        makeThread(),
      ),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'subject', op: 'contains', value: 'invoice' }]))(
        makeThread(),
      ),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'subject', op: 'not-contains', value: 'refund' }]))(
        makeThread(),
      ),
    ).toBe(true)
  })

  it('matches participant email and labels (array fields)', () => {
    expect(
      compilePredicate(plan([{ field: 'from', op: 'contains', value: '@shop.example' }]))(
        makeThread(),
      ),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'labels', op: 'is', value: 'finance' }]))(makeThread()),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'labels', op: 'is', value: 'personal' }]))(makeThread()),
    ).toBe(false)
  })

  it('compares priorityScore numerically with gt/lt', () => {
    const highValue = compilePredicate(plan([{ field: 'priorityScore', op: 'gt', value: '50' }]))
    expect(highValue(makeThread({ priorityScore: 80 }))).toBe(true)
    expect(highValue(makeThread({ priorityScore: 20 }))).toBe(false)
    const lowValue = compilePredicate(plan([{ field: 'priorityScore', op: 'lt', value: '50' }]))
    expect(lowValue(makeThread({ priorityScore: 20 }))).toBe(true)
  })

  it('supports regex matches on the subject', () => {
    const match = compilePredicate(
      plan([{ field: 'subject', op: 'matches', value: 'invoice #\\d+' }]),
    )
    expect(match(makeThread())).toBe(true)
    expect(match(makeThread({ subject: 'Just saying hi' }))).toBe(false)
  })

  it('matches the boolean awaitingReply field', () => {
    const match = compilePredicate(plan([{ field: 'awaitingReply', op: 'is', value: 'true' }]))
    expect(match(makeThread({ awaitingReply: true }))).toBe(true)
    expect(match(makeThread({ awaitingReply: false }))).toBe(false)
  })

  it('matches every thread when there are no conditions', () => {
    const match = compilePredicate(plan([]))
    expect(match(makeThread())).toBe(true)
    expect(match(makeThread({ category: 'personal' }))).toBe(true)
  })

  it('never matches on an unknown field', () => {
    const match = compilePredicate(plan([{ field: 'nonsense', op: 'is', value: 'x' }]))
    expect(match(makeThread())).toBe(false)
  })

  it('resolves the other scalar fields (priority, unread, starred, snoozed, language, name)', () => {
    expect(
      compilePredicate(plan([{ field: 'priority', op: 'is', value: 'normal' }]))(makeThread()),
    ).toBe(true)
    expect(compilePredicate(plan([{ field: 'unread', op: 'is', value: 'true' }]))(makeThread())).toBe(
      true,
    )
    expect(
      compilePredicate(plan([{ field: 'starred', op: 'is', value: 'false' }]))(makeThread()),
    ).toBe(true)
    // snoozed derives a boolean from snoozedUntil being non-null.
    expect(
      compilePredicate(plan([{ field: 'snoozed', op: 'is', value: 'true' }]))(
        makeThread({ snoozedUntil: '2026-08-01T00:00:00Z' }),
      ),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'snoozed', op: 'is', value: 'false' }]))(makeThread()),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'language', op: 'is', value: 'nl' }]))(
        makeThread({ language: 'nl' }),
      ),
    ).toBe(true)
    expect(
      compilePredicate(plan([{ field: 'name', op: 'contains', value: 'Billing' }]))(makeThread()),
    ).toBe(true)
  })

  it('applies is-not / not-contains across an array field with "every"', () => {
    // labels = ['finance', 'q3']; is-not 'personal' holds for all ⇒ true.
    expect(
      compilePredicate(plan([{ field: 'labels', op: 'is-not', value: 'personal' }]))(makeThread()),
    ).toBe(true)
    // is-not 'finance' fails because one label equals it.
    expect(
      compilePredicate(plan([{ field: 'labels', op: 'is-not', value: 'finance' }]))(makeThread()),
    ).toBe(false)
    expect(
      compilePredicate(plan([{ field: 'labels', op: 'not-contains', value: 'xyz' }]))(makeThread()),
    ).toBe(true)
  })

  it('coerces truthy strings (yes/1/y) for boolean fields', () => {
    for (const value of ['true', '1', 'yes', 'y']) {
      expect(
        compilePredicate(plan([{ field: 'unread', op: 'is', value }]))(makeThread({ unread: true })),
      ).toBe(true)
    }
  })

  it('never matches when the matches-regex is invalid', () => {
    const match = compilePredicate(plan([{ field: 'subject', op: 'matches', value: '([' }]))
    expect(match(makeThread())).toBe(false)
  })

  it('gt/lt return false when the field has no numeric value', () => {
    expect(
      compilePredicate(plan([{ field: 'subject', op: 'gt', value: '5' }]))(makeThread()),
    ).toBe(false)
    expect(compilePredicate(plan([{ field: 'labels', op: 'lt', value: '5' }]))(makeThread())).toBe(
      false,
    )
  })

  it('selects the expected subset from a mixed set of threads', () => {
    const threads = [
      makeThread({ id: 'a', category: 'receipts', priorityScore: 70 }),
      makeThread({ id: 'b', category: 'receipts', priorityScore: 30 }),
      makeThread({ id: 'c', category: 'newsletters', priorityScore: 90 }),
    ]
    const match = compilePredicate(
      plan([
        { field: 'category', op: 'is', value: 'receipts' },
        { field: 'priorityScore', op: 'gt', value: '50' },
      ]),
    )
    expect(threads.filter(match).map((t) => t.id)).toEqual(['a'])
  })
})

describe('approval helpers', () => {
  it('flags consequential action types', () => {
    expect(actionNeedsApproval('send')).toBe(true)
    expect(actionNeedsApproval('unsubscribe')).toBe(true)
    expect(actionNeedsApproval('label')).toBe(false)
  })

  it('detects whether a plan needs approval', () => {
    expect(planRequiresApproval(plan([], [{ type: 'label', label: 'Label Receipts' }]))).toBe(false)
    expect(planRequiresApproval(plan([], [{ type: 'send', label: 'Send chaser' }]))).toBe(true)
  })
})

describe('approval helpers — full consequential set', () => {
  it('gates send, unsubscribe, delete, and forward; auto-runs the rest', () => {
    for (const t of ['send', 'unsubscribe', 'delete', 'forward'] as const) {
      expect(actionNeedsApproval(t)).toBe(true)
    }
    for (const t of ['label', 'archive', 'draft', 'star', 'mark-read'] as const) {
      expect(actionNeedsApproval(t)).toBe(false)
    }
  })
})

describe('agentPlanSchema', () => {
  it('parses a well-formed plan', () => {
    const parsed = agentPlanSchema.parse({
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [{ type: 'label', label: 'Label Receipts' }],
    })
    expect(parsed.conditions).toHaveLength(1)
  })

  it('rejects an unknown trigger', () => {
    expect(
      agentPlanSchema.safeParse({ trigger: 'on-star', conditions: [], actions: [] }).success,
    ).toBe(false)
  })
})

describe('agentConditionSchema / agentActionSchema', () => {
  it('rejects an unsupported operator', () => {
    expect(
      agentConditionSchema.safeParse({ field: 'category', op: 'like', value: 'x' }).success,
    ).toBe(false)
  })

  it('rejects an unknown action type', () => {
    expect(agentActionSchema.safeParse({ type: 'nuke', label: 'x' }).success).toBe(false)
    expect(agentActionSchema.safeParse({ type: 'archive', label: 'Archive' }).success).toBe(true)
  })
})

describe('content clauses (hybrid AI stage)', () => {
  const plan = (conditions: AgentPlan['conditions']): AgentPlan => ({
    trigger: 'new-mail',
    conditions,
    actions: [],
  })

  it('compilePredicate treats a content clause as pass-through (deferred to AI stage)', () => {
    // A content-only rule matches every thread at stage 1; stage 2 (AI) narrows it.
    const p = plan([{ field: CONTENT_FIELD, op: 'is', value: 'an invoice' }])
    expect(compilePredicate(p)(makeThread())).toBe(true)
    expect(compilePredicate(p)(makeThread({ category: 'personal' }))).toBe(true)
  })

  it('still ANDs a content clause with structured clauses at stage 1', () => {
    const p = plan([
      { field: CONTENT_FIELD, op: 'is', value: 'an invoice' },
      { field: 'category', op: 'is', value: 'receipts' },
    ])
    expect(compilePredicate(p)(makeThread({ category: 'receipts' }))).toBe(true)
    expect(compilePredicate(p)(makeThread({ category: 'personal' }))).toBe(false)
  })

  it('contentClauses extracts only content-field conditions', () => {
    const p = plan([
      { field: CONTENT_FIELD, op: 'is', value: 'an invoice' },
      { field: 'category', op: 'is', value: 'receipts' },
    ])
    expect(contentClauses(p)).toEqual([{ field: CONTENT_FIELD, op: 'is', value: 'an invoice' }])
  })
})

describe('forwardDestination', () => {
  it('returns a valid params.to email', () => {
    expect(forwardDestination({ type: 'forward', label: 'fwd', params: { to: 'a@b.com' } })).toBe(
      'a@b.com',
    )
    expect(
      forwardDestination({ type: 'forward', label: 'fwd', params: { to: '  a@b.com ' } }),
    ).toBe('a@b.com')
  })

  it('returns null when missing or invalid', () => {
    expect(forwardDestination({ type: 'forward', label: 'fwd' })).toBeNull()
    expect(forwardDestination({ type: 'forward', label: 'fwd', params: { to: '' } })).toBeNull()
    expect(forwardDestination({ type: 'forward', label: 'fwd', params: { to: 'not-an-email' } })).toBeNull()
  })
})
