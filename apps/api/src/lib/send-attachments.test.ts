/**
 * `linkPendingAttachments` — claiming a composer's pending uploads for a message.
 *
 * The DB is never touched: a fake transaction records the `update`/`set`/`where`
 * calls. drizzle's real `and/eq/inArray/isNull` build SQL AST off the (unmocked)
 * `attachments` columns without a connection, so the guard is exercised as-authored.
 */
import { describe, expect, it } from 'vitest'
import type { DbTransaction } from '@revido/db/client'
import { attachments } from '@revido/db/schema'
import { linkPendingAttachments } from './send'

const USER_ID = '11111111-2222-4333-8444-555555555555'
const MESSAGE_ID = 'msg-1'

interface Captured {
  updated?: unknown
  set?: Record<string, unknown>
  wheres: unknown[]
}

function fakeTx(): { tx: DbTransaction; captured: Captured } {
  const captured: Captured = { wheres: [] }
  const tx = {
    update(table: unknown) {
      captured.updated = table
      return this
    },
    set(payload: Record<string, unknown>) {
      captured.set = payload
      return this
    },
    where(cond: unknown) {
      captured.wheres.push(cond)
      return Promise.resolve()
    },
  }
  return { tx: tx as unknown as DbTransaction, captured }
}

describe('linkPendingAttachments', () => {
  it('sets message_id on the attachments table when ids are given', async () => {
    const { tx, captured } = fakeTx()
    await linkPendingAttachments(tx, USER_ID, MESSAGE_ID, ['att-1', 'att-2'])

    expect(captured.updated).toBe(attachments)
    expect(captured.set).toEqual({ messageId: MESSAGE_ID })
    expect(captured.wheres).toHaveLength(1) // the ownership + still-pending guard
  })

  it('is a no-op when there are no attachment ids', async () => {
    const { tx, captured } = fakeTx()
    await linkPendingAttachments(tx, USER_ID, MESSAGE_ID, undefined)
    await linkPendingAttachments(tx, USER_ID, MESSAGE_ID, [])
    expect(captured.updated).toBeUndefined()
    expect(captured.wheres).toHaveLength(0)
  })
})
