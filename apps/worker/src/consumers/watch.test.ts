import { describe, expect, it, vi } from 'vitest'
import type { ProviderAdapter, ProviderCredentials, WatchRegistration } from '@revido/core'
import type { AccountContext, AccountCrypto } from '../db/accounts'
import type { SaveCursorInput } from '../mail/store'
import type { ClaimedJob } from '../queue/store'
import { QUEUE } from '../queue/jobs'
import { makeReconcileConsumer, makeRenewWatchConsumer, type RenewWatchDeps } from './watch'

const passthroughCrypto: AccountCrypto = {
  encrypt: (plaintext) => ({ ct: plaintext, iv: '', tag: '', v: 1 }),
  decrypt: (ciphertext) => ciphertext.ct,
}

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const PAYLOAD = { accountId: ACCOUNT_ID }
const JOB: ClaimedJob = { id: 'j', queue: 'renew_watch', payload: PAYLOAD, attempts: 0, maxAttempts: 5 }

function fakeAccount(provider: 'gmail' | 'outlook'): AccountContext {
  return {
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    provider,
    email: 'me@example.com',
    dek: new Uint8Array(32),
    creds: { accessToken: 'a', refreshToken: 'r', expiresAt: new Date().toISOString() },
    crypto: passthroughCrypto,
  }
}

function fakeAdapter(
  watch: WatchRegistration,
  opts: { connectReturns?: (creds: ProviderCredentials) => ProviderCredentials } = {},
): ProviderAdapter {
  const unsupported = (name: string) => (): never => {
    throw new Error(`unexpected adapter call: ${name}`)
  }
  return {
    provider: 'gmail',
    connect: (creds) => Promise.resolve((opts.connectReturns ?? ((c) => c))(creds)),
    watch: () => Promise.resolve(watch),
    backfill: unsupported('backfill'),
    incremental: unsupported('incremental'),
    getMessage: unsupported('getMessage'),
    send: unsupported('send'),
    renewWatch: unsupported('renewWatch'),
    unsubscribe: unsupported('unsubscribe'),
  }
}

function renewHarness(
  provider: 'gmail' | 'outlook',
  watch: WatchRegistration,
  opts: { connectReturns?: (creds: ProviderCredentials) => ProviderCredentials } = {},
): { deps: RenewWatchDeps; cursors: SaveCursorInput[]; saveCredentials: ReturnType<typeof vi.fn> } {
  const cursors: SaveCursorInput[] = []
  const saveCredentials = vi.fn(() => Promise.resolve())
  const deps: RenewWatchDeps = {
    loadAccount: () => Promise.resolve(fakeAccount(provider)),
    adapterFor: () => fakeAdapter(watch, opts),
    mail: {
      saveCursor: async (input) => {
        cursors.push(input)
      },
    },
    saveCredentials,
  }
  return { deps, cursors, saveCredentials }
}

const WATCH: WatchRegistration = {
  id: 'sub-1',
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  cursor: '900100',
}

describe('makeRenewWatchConsumer', () => {
  it('registers a Gmail watch and seeds the historyId cursor + subscription id', async () => {
    const h = renewHarness('gmail', WATCH)
    await makeRenewWatchConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.cursors[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      historyId: '900100',
      deltaLink: undefined,
      subscriptionId: 'sub-1',
    })
  })

  it('registers an Outlook subscription and seeds the deltaLink cursor + subscription id', async () => {
    const h = renewHarness('outlook', { ...WATCH, cursor: 'delta-url' })
    await makeRenewWatchConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.cursors[0]).toEqual({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      historyId: undefined,
      deltaLink: 'delta-url',
      subscriptionId: 'sub-1',
    })
  })

  it('saves refreshed credentials when the adapter rotates the access token', async () => {
    const refreshed: ProviderCredentials = {
      accessToken: 'fresh',
      refreshToken: 'r',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }
    const h = renewHarness('gmail', WATCH, { connectReturns: () => refreshed })
    await makeRenewWatchConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.saveCredentials).toHaveBeenCalledTimes(1)
    expect(h.saveCredentials.mock.calls[0]?.[1]).toBe(refreshed)
  })

  it('does not save credentials when connect returns the same token set', async () => {
    const h = renewHarness('gmail', WATCH)
    await makeRenewWatchConsumer(h.deps)(PAYLOAD, JOB)
    expect(h.saveCredentials).not.toHaveBeenCalled()
  })

  it('rejects a malformed payload', async () => {
    const h = renewHarness('gmail', WATCH)
    await expect(
      makeRenewWatchConsumer(h.deps)({ accountId: 'nope' }, JOB),
    ).rejects.toThrow()
  })
})

describe('makeReconcileConsumer', () => {
  it('enqueues an incremental sweep for the account (missed-push safety net)', async () => {
    const enqueued: { queue: string; payload: unknown }[] = []
    const consumer = makeReconcileConsumer({
      jobs: {
        enqueue: async (queue, payload) => {
          enqueued.push({ queue, payload })
        },
      },
    })
    await consumer(PAYLOAD, { ...JOB, queue: 'reconcile' })
    expect(enqueued).toEqual([{ queue: QUEUE.incremental, payload: { accountId: ACCOUNT_ID } }])
  })

  it('rejects a malformed payload before enqueueing', async () => {
    const enqueue = vi.fn()
    const consumer = makeReconcileConsumer({ jobs: { enqueue } })
    await expect(consumer({ accountId: 'bad' }, { ...JOB, queue: 'reconcile' })).rejects.toThrow()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
