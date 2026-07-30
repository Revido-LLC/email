import { withUser } from '@revido/db/client'
import { accounts, calendarAccounts, calendarEvents } from '@revido/db/schema'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { z } from 'zod'
import { getUserCrypto } from '../lib/crypto'
import { HttpError, readJson } from '../lib/http'
import { protectedRouter } from '../lib/protected'

const connectInput = z.object({
  accountId: z.string().uuid(),
  externalCalendarId: z.string().trim().min(1).max(255).default('primary'),
})

function parseLimit(raw?: string): number {
  const parsed = Number(raw ?? 30)
  return Number.isInteger(parsed) ? Math.min(100, Math.max(1, parsed)) : 30
}

function decodeCursor(raw?: string): Date | undefined {
  if (!raw) return undefined
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { startsAt: string }
    const date = new Date(value.startsAt)
    if (!Number.isFinite(date.valueOf())) throw new Error()
    return date
  } catch {
    throw new HttpError(400, 'invalid_cursor')
  }
}

export const calendarRouter = protectedRouter()

calendarRouter.get('/accounts', async (c) => {
  const userId = c.get('userId')
  const rows = await withUser(userId, (tx) =>
    tx
      .select({
        id: calendarAccounts.id,
        accountId: calendarAccounts.accountId,
        provider: accounts.provider,
        email: accounts.email,
        externalCalendarId: calendarAccounts.externalCalendarId,
        enabled: calendarAccounts.enabled,
        lastSyncedAt: calendarAccounts.lastSyncedAt,
      })
      .from(calendarAccounts)
      .innerJoin(accounts, eq(accounts.id, calendarAccounts.accountId)),
  )
  return c.json(rows)
})

calendarRouter.post('/accounts', async (c) => {
  const userId = c.get('userId')
  const input = await readJson(c, connectInput)
  const row = await withUser(userId, async (tx) => {
    const account = (
      await tx.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1)
    )[0]
    if (!account) throw new HttpError(404, 'account_not_found')
    const hasCalendarScope = (account.scopes ?? []).some((scope) =>
      scope.toLocaleLowerCase().includes('calendar'),
    )
    if (!hasCalendarScope) {
      throw new HttpError(409, 'calendar_reauthorization_required')
    }
    return (
      await tx
        .insert(calendarAccounts)
        .values({
          userId,
          accountId: account.id,
          externalCalendarId: input.externalCalendarId ?? 'primary',
        })
        .onConflictDoUpdate({
          target: [calendarAccounts.accountId, calendarAccounts.externalCalendarId],
          set: { enabled: true, updatedAt: new Date() },
        })
        .returning()
    )[0]
  })
  return c.json(row, 201)
})

calendarRouter.get('/events', async (c) => {
  const userId = c.get('userId')
  const crypto = await getUserCrypto(userId)
  const limit = parseLimit(c.req.query('limit'))
  const cursor = decodeCursor(c.req.query('cursor'))
  const untilRaw = c.req.query('until')
  const until = untilRaw ? new Date(untilRaw) : undefined
  if (until && !Number.isFinite(until.valueOf())) throw new HttpError(400, 'invalid_until')
  const rows = await withUser(userId, (tx) =>
    tx
      .select()
      .from(calendarEvents)
      .where(
        and(
          cursor ? gt(calendarEvents.startsAt, cursor) : undefined,
          until ? lte(calendarEvents.startsAt, until) : undefined,
        ),
      )
      .orderBy(asc(calendarEvents.startsAt))
      .limit(limit + 1),
  )
  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  return c.json({
    items: page.map((row) => ({
      id: row.id,
      title: crypto.decrypt(row.titleCt),
      description: crypto.decryptOptional(row.descriptionCt),
      location: crypto.decryptOptional(row.locationCt),
      joinUrl: crypto.decryptOptional(row.joinUrlCt),
      attendees: JSON.parse(crypto.decrypt(row.attendeesCt) || '[]') as unknown[],
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timezone: row.timezone,
      status: row.status,
      recurringEventId: row.recurringEventId,
    })),
    nextCursor:
      hasMore && last
        ? Buffer.from(JSON.stringify({ startsAt: last.startsAt.toISOString() })).toString(
            'base64url',
          )
        : null,
  })
})
