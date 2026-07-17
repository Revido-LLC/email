/**
 * `POST /leads` — "Talk to Revido" sales-lead capture (IA S12).
 *
 * Inserts a `leads` row via `asService` (the table has no `app_user` grant) and,
 * when a session is present, attributes it to that user; the form is reachable
 * before sign-in, so auth is optional and the endpoint is per-IP rate limited.
 * If `LEAD_NOTIFY_WEBHOOK_URL` is set, a best-effort notification is POSTed
 * fire-and-forget — it never blocks or fails the `{ id }` response.
 *
 * The mock's request `{ name, email, company, automate }` maps onto the schema's
 * columns: `automate` (what the user wants automated) is stored as `message`.
 */
import { Hono } from 'hono'
import { asService } from '@revido/db/client'
import { leads } from '@revido/db/schema'
import { z } from 'zod'
import { auth } from '../auth'
import { errorHandler, readJson } from '../lib/http'
import { rateLimit } from '../lib/rate-limit'
import type { Variables } from '../middleware/auth'

const LEADS_RATE_WINDOW_MS = 60_000
const LEADS_RATE_MAX = 10

const leadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  automate: z.string().optional(),
})

export const leadsRouter = new Hono<{ Variables: Variables }>()
leadsRouter.onError(errorHandler)
leadsRouter.use('*', rateLimit({ windowMs: LEADS_RATE_WINDOW_MS, max: LEADS_RATE_MAX }))

interface LeadNotification {
  id: string
  name: string
  email: string
  company?: string
  automate?: string
}

/** Fire-and-forget lead notification; swallows every error so it can't block the response. */
function notifyLead(lead: LeadNotification): void {
  const url = process.env.LEAD_NOTIFY_WEBHOOK_URL
  if (!url) return
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lead),
  }).catch((err) => console.error('[api] lead webhook failed', err))
}

/** POST /leads — capture a sales lead (auth optional) → { id }. */
leadsRouter.post('/', async (c) => {
  const body = await readJson(c, leadSchema)

  let userId: string | null = null
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    userId = session?.user.id ?? null
  } catch {
    userId = null
  }

  const { id } = await asService(async (tx) => {
    const rows = await tx
      .insert(leads)
      .values({
        userId,
        email: body.email,
        name: body.name,
        company: body.company ?? null,
        message: body.automate ?? null,
        source: 'talk',
      })
      .returning({ id: leads.id })
    const row = rows.at(0)
    if (!row) throw new Error('lead_insert_failed')
    return row
  })

  notifyLead({ id, name: body.name, email: body.email, company: body.company, automate: body.automate })

  return c.json({ id }, 201)
})
