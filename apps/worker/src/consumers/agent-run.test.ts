import { describe, expect, it, vi } from 'vitest'
import { FakeLlmClient, type AgentPlan } from '@revido/core'
import type { Thread } from '@revido/db'
import type { AccountCrypto, UserContext } from '../db/accounts'
import type {
  ApplyThreadActionInput,
  EnqueueApprovalInput,
  RecordAgentRunInput,
  StoredAgentPlan,
} from '../mail/store'
import { makeAgentRunConsumer, type AgentRunDeps } from './agent-run'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const USER_ID = '22222222-2222-2222-2222-222222222222'
const AGENT_ID = '33333333-3333-3333-3333-333333333333'
const THREAD_ID = '44444444-4444-4444-4444-444444444444'

function fakeUser(): UserContext {
  return { userId: USER_ID, dek: new Uint8Array(32), crypto: passthroughCrypto }
}

function fakeThread(): Thread {
  return {
    id: THREAD_ID,
    accountId: '11111111-1111-1111-1111-111111111111',
    subject: 'Weekly newsletter',
    participants: [{ name: 'News', email: 'news@acme.com' }],
    category: 'newsletters',
    priority: 'low',
    priorityScore: 10,
    tldr: '',
    summary: '',
    unread: true,
    starred: false,
    snoozedUntil: null,
    hasAttachments: false,
    badges: [],
    extracted: [],
    messageIds: [],
    lastMessageAt: '2026-07-15T00:00:00Z',
    awaitingReply: false,
    labels: [],
  }
}

const PAYLOAD = { userId: USER_ID, agentId: AGENT_ID }
const JOB = { id: 'j', queue: 'agent_run', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

interface Harness {
  deps: AgentRunDeps
  actions: ApplyThreadActionInput[]
  approvals: EnqueueApprovalInput[]
  runs: RecordAgentRunInput[]
  increments: string[]
}

function harness(plan: AgentPlan): Harness {
  const actions: ApplyThreadActionInput[] = []
  const approvals: EnqueueApprovalInput[] = []
  const runs: RecordAgentRunInput[] = []
  const increments: string[] = []
  const stored: StoredAgentPlan = { name: 'Newsletter Filer', icon: 'inbox', trusted: false, plan }

  const deps: AgentRunDeps = {
    loadUser: () => Promise.resolve(fakeUser()),
    mail: {
      getAgentPlan: () => Promise.resolve(stored),
      listAgentThreads: () => Promise.resolve([fakeThread()]),
      getThread: () => Promise.resolve(null),
      applyThreadAction: async (input) => {
        actions.push(input)
      },
      enqueueApproval: async (input) => {
        approvals.push(input)
      },
      recordAgentRun: async (input) => {
        runs.push(input)
      },
      increment: async (_userId, metric) => {
        increments.push(metric)
      },
    },
    llm: new FakeLlmClient(),
  }
  return { deps, actions, approvals, runs, increments }
}

describe('makeAgentRunConsumer', () => {
  it('auto-runs a SAFE action (label) and records a reversible run', async () => {
    const plan: AgentPlan = {
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'newsletters' }],
      actions: [{ type: 'label', label: 'Filed' }],
    }
    const h = harness(plan)

    await makeAgentRunConsumer(h.deps)(PAYLOAD, JOB)

    expect(h.actions).toHaveLength(1)
    expect(h.actions[0]).toMatchObject({ threadId: THREAD_ID, type: 'label', label: 'Filed' })
    expect(h.approvals).toHaveLength(0)
    expect(h.runs).toHaveLength(1)
    expect(h.runs[0]).toMatchObject({ status: 'done', reversible: true })
    expect(h.runs[0]?.affected[0]?.threadId).toBe(THREAD_ID)
    expect(h.increments).toEqual(['agent_runs'])
  })

  it('gates a CONSEQUENTIAL action (send) into an approval instead of executing it', async () => {
    const plan: AgentPlan = {
      trigger: 'new-mail',
      conditions: [],
      actions: [{ type: 'send', label: 'Send unsubscribe reply' }],
    }
    const h = harness(plan)

    await makeAgentRunConsumer(h.deps)(PAYLOAD, JOB)

    expect(h.actions).toHaveLength(0) // never executed
    expect(h.approvals).toHaveLength(1)
    expect(h.approvals[0]).toMatchObject({ action: 'send', threadId: THREAD_ID })
    expect(h.runs[0]).toMatchObject({ status: 'pending-approval', reversible: false })
    expect(h.increments).toEqual(['agent_runs'])
  })

  it('skips the run entirely when no thread matches the plan predicate', async () => {
    const plan: AgentPlan = {
      trigger: 'new-mail',
      conditions: [{ field: 'category', op: 'is', value: 'receipts' }],
      actions: [{ type: 'label', label: 'x' }],
    }
    const h = harness(plan)
    const record = vi.spyOn(h.deps.mail, 'recordAgentRun')

    await makeAgentRunConsumer(h.deps)(PAYLOAD, JOB)

    expect(h.actions).toHaveLength(0)
    expect(record).not.toHaveBeenCalled()
  })
})
