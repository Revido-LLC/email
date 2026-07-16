import { describe, expect, it } from 'vitest'
import type { Thread } from '@revido/db'
import {
  actionNeedsApproval,
  agentPlanSchema,
  compilePredicate,
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

describe('agentPlanSchema', () => {
  it('parses a well-formed plan', () => {
    const parsed = agentPlanSchema.parse({
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [{ type: 'label', label: 'Label Receipts' }],
    })
    expect(parsed.conditions).toHaveLength(1)
  })
})
