/**
 * Unit tests for the per-user encrypt/decrypt DTO mapping. These exercise the
 * pure row → DTO mappers (no DB) with a real DEK, proving that ciphertext columns
 * round-trip to plaintext domain fields and that missing columns decrypt to the
 * empty/undefined defaults.
 */
import { describe, expect, it } from 'vitest'
import { makeUserCrypto } from './crypto'
import { mapAgentRun, mapApproval, mapReminder, mapSignature } from './mappers'

const DEK = new Uint8Array(32).fill(7)
const crypto = makeUserCrypto(DEK)
const OTHER = makeUserCrypto(new Uint8Array(32).fill(9))

describe('makeUserCrypto', () => {
  it('round-trips plaintext through the envelope', () => {
    const ct = crypto.encrypt('hello world')
    expect(ct.ct).not.toContain('hello')
    expect(crypto.decrypt(ct)).toBe('hello world')
  })

  it('decrypts a missing column to empty / undefined', () => {
    expect(crypto.decrypt(null)).toBe('')
    expect(crypto.decrypt(undefined)).toBe('')
    expect(crypto.decryptOptional(null)).toBeUndefined()
  })

  it('fails closed on a wrong DEK (GCM auth failure, never garbage)', () => {
    const ct = crypto.encrypt('secret')
    expect(() => OTHER.decrypt(ct)).toThrow()
  })
})

describe('mapApproval', () => {
  it('decrypts subject + preview, coercing plaintext metadata nulls', () => {
    const row = {
      id: 'ap-1',
      userId: 'u-1',
      agentId: 'ag-1',
      agentName: 'Sorter',
      agentIcon: 'Bot',
      action: 'archive',
      threadId: 'th-1',
      subjectCt: crypto.encrypt('Invoice #42'),
      sender: 'billing@acme.co',
      previewCt: crypto.encrypt('Archive this receipt?'),
      createdAt: new Date('2026-07-15T10:00:00Z'),
    }
    const dto = mapApproval(crypto, row)
    expect(dto).toMatchObject({
      id: 'ap-1',
      agentId: 'ag-1',
      subject: 'Invoice #42',
      preview: 'Archive this receipt?',
      sender: 'billing@acme.co',
      createdAt: '2026-07-15T10:00:00.000Z',
    })
  })
})

describe('mapReminder', () => {
  it('decrypts context + optional draft reply', () => {
    const withDraft = mapReminder(crypto, {
      id: 'r-1',
      userId: 'u-1',
      kind: 'follow-up',
      threadId: 'th-1',
      subjectCt: crypto.encrypt('Re: proposal'),
      contextCt: crypto.encrypt('No reply in 5 days'),
      sender: 'sam@x.co',
      dueAt: new Date('2026-07-16T09:00:00Z'),
      draftReplyCt: crypto.encrypt('Just checking in!'),
      createdAt: new Date('2026-07-15T10:00:00Z'),
    })
    expect(withDraft.context).toBe('No reply in 5 days')
    expect(withDraft.draftReply).toBe('Just checking in!')

    const noDraft = mapReminder(crypto, {
      id: 'r-2',
      userId: 'u-1',
      kind: 'deadline',
      threadId: null,
      subjectCt: crypto.encrypt('Taxes'),
      contextCt: null,
      sender: null,
      dueAt: new Date('2026-07-20T09:00:00Z'),
      draftReplyCt: null,
      createdAt: new Date('2026-07-15T10:00:00Z'),
    })
    expect(noDraft.context).toBe('')
    expect(noDraft.threadId).toBe('')
    expect(noDraft.draftReply).toBeUndefined()
  })
})

describe('mapSignature', () => {
  it('decrypts the signature HTML', () => {
    const dto = mapSignature(crypto, {
      id: 'sig-1',
      userId: 'u-1',
      accountId: 'acc-1',
      name: 'Default',
      htmlCt: crypto.encrypt('<p>Sam</p>'),
      createdAt: new Date('2026-07-15T10:00:00Z'),
      updatedAt: new Date('2026-07-15T10:00:00Z'),
    })
    expect(dto).toEqual({ id: 'sig-1', accountId: 'acc-1', name: 'Default', html: '<p>Sam</p>' })
  })
})

describe('mapAgentRun', () => {
  it('decrypts summary/reasoning and parses the affected snapshot', () => {
    const affected = [{ threadId: 'th-1', subject: 'Report', sender: 'a@b.co' }]
    const dto = mapAgentRun(crypto, {
      id: 'run-1',
      userId: 'u-1',
      agentId: 'ag-1',
      agentName: 'Sorter',
      agentIcon: 'Bot',
      at: new Date('2026-07-15T10:00:00Z'),
      summaryCt: crypto.encrypt('Filed 3 receipts'),
      reasoningCt: crypto.encrypt('Matched category:receipts'),
      affectedCt: crypto.encrypt(JSON.stringify(affected)),
      status: 'done',
      reversible: true,
      createdAt: new Date('2026-07-15T10:00:00Z'),
    })
    expect(dto.summary).toBe('Filed 3 receipts')
    expect(dto.affected).toEqual(affected)
    expect(dto.status).toBe('done')
  })

  it('tolerates a non-array / empty affected snapshot', () => {
    const dto = mapAgentRun(crypto, {
      id: 'run-2',
      userId: 'u-1',
      agentId: null,
      agentName: null,
      agentIcon: null,
      at: new Date('2026-07-15T10:00:00Z'),
      summaryCt: null,
      reasoningCt: null,
      affectedCt: null,
      status: 'reversed',
      reversible: false,
      createdAt: new Date('2026-07-15T10:00:00Z'),
    })
    expect(dto.affected).toEqual([])
    expect(dto.agentId).toBe('')
    expect(dto.summary).toBe('')
  })
})
