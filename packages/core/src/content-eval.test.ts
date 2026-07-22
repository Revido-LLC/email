import { describe, expect, it } from 'vitest'
import type { Thread } from '@revido/db'
import type { AgentPlan } from './agent-plan'
import { planContentEvaluation } from './content-eval'

/** Minimal Thread factory — only the fields the planner reads. */
function thread(over: Partial<Thread>): Thread {
  return {
    id: 'id',
    accountId: 'acc',
    subject: 'Subject',
    participants: [],
    category: 'receipts',
    priority: 'normal',
    priorityScore: 50,
    tldr: '',
    summary: '',
    unread: false,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: ['m1'],
    lastMessageAt: '2026-07-01T00:00:00.000Z',
    awaitingReply: false,
    labels: [],
    ...over,
  } as Thread
}

const receiptPlan: AgentPlan = {
  trigger: 'new-mail',
  conditions: [
    { field: 'category', op: 'is', value: 'receipts' },
    { field: 'content', op: 'is', value: 'a receipt for a completed payment' },
  ],
  actions: [{ type: 'forward', label: 'Forward to accounting', params: { to: 'a@b.co' } }],
}

describe('planContentEvaluation', () => {
  it('hard-excludes dunning candidates for free and passes plausible ones to AI', () => {
    const threads = [
      thread({ id: 'good', subject: 'Your receipt from Acme' }),
      thread({ id: 'dunning', subject: 'FINAL NOTICE: update your payment' }),
      thread({ id: 'other', subject: 'Receipt', category: 'to-reply' }), // fails metadata gate
    ]
    const r = planContentEvaluation(receiptPlan, threads)
    expect(r.needsAi.map((t) => t.id)).toEqual(['good'])
    expect(r.excluded.map((e) => e.thread.id)).toEqual(['dunning'])
    expect(r.autoMatched).toEqual([]) // content clause present ⇒ nothing auto-matches
  })

  it('auto-matches on metadata alone when there is no content clause', () => {
    const metaOnly: AgentPlan = {
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [{ type: 'label', label: 'Label' }],
    }
    const threads = [thread({ id: 'a' }), thread({ id: 'b', category: 'to-reply' })]
    const r = planContentEvaluation(metaOnly, threads)
    expect(r.autoMatched.map((t) => t.id)).toEqual(['a'])
    expect(r.needsAi).toEqual([])
    expect(r.excluded).toEqual([])
  })
})
