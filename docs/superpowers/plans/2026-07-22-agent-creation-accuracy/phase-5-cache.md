# Phase 5 — (Optional) Persistent verdict cache

The fix in Phases 1–4 already bounds cost (free pre-filter + `PREVIEW_AI_CAP`). This phase adds a durable per-thread verdict cache so the dry-run and runtime never re-classify the same thread. Ship only if the extra migration is wanted now. Depends on Phases 1–4.

**Phase verification gate:** `pnpm --filter @revido/db test && pnpm --filter @revido/api test && pnpm --filter @revido/worker test`.

---

## Task 11: `agent_content_verdicts` table + store

**Files:**
- Modify: `packages/db/src/schema/agents.ts`
- Generate: migration via `pnpm --filter @revido/db db:generate` (drizzle-kit owns SQL + `meta/_journal.json`)
- Modify: the generated `packages/db/drizzle/000N_*.sql` (append RLS)
- Modify: `apps/worker/src/mail/store.ts`, `apps/worker/src/mail/pg-store.ts`

- [ ] **Step 1: Add the Drizzle table** to `schema/agents.ts` (imports `boolean`, `index`, `pgTable`, `text`, `uuid`, `createdAt`, `users`, `threads` are already present in that file):

```ts
export const agentContentVerdicts = pgTable(
  'agent_content_verdicts',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
    /** Stable hash of the plan's normalized content-clause value(s). */
    clauseHash: text('clause_hash').notNull(),
    verdict: boolean('verdict').notNull(),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [index('agent_content_verdicts_user_id_idx').on(t.userId)],
)
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @revido/db db:generate`
Expected: new `packages/db/drizzle/000N_*.sql` + updated `meta/_journal.json`.

- [ ] **Step 3: Append RLS to the generated SQL** (match the `0001_rls_policies.sql` pattern — `current_setting('app.user_id', true)::uuid`):

```sql
--> statement-breakpoint
ALTER TABLE "agent_content_verdicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_content_verdicts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "agent_content_verdicts_owner" ON "agent_content_verdicts"
  FOR ALL
  USING ("user_id" = current_setting('app.user_id', true)::uuid)
  WITH CHECK ("user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_content_verdicts_uq"
  ON "agent_content_verdicts" ("user_id", "thread_id", "clause_hash");
```

- [ ] **Step 4: Add the store port** to `apps/worker/src/mail/store.ts`:

```ts
export interface VerdictStore {
  /** Cached verdicts for these threads under a clause hash: threadId → verdict. */
  getContentVerdicts(
    userId: string,
    threadIds: string[],
    clauseHash: string,
  ): Promise<Map<string, boolean>>
  putContentVerdict(
    userId: string,
    threadId: string,
    clauseHash: string,
    verdict: boolean,
    model: string,
  ): Promise<void>
}
```

Add `VerdictStore` to the `MailStore extends (...)` union.

- [ ] **Step 5: Implement in `pg-store.ts`** under `withUser` (follow the existing method style; upsert on conflict `(user_id, thread_id, clause_hash)` do update `verdict`, `model`). Use Drizzle `agentContentVerdicts` from `@revido/db/schema`.

- [ ] **Step 6: Tests + local apply**

Run: `pnpm --filter @revido/db test` and apply the migration locally via the repo's DB-reset flow. Expected: schema + RLS tests pass; `getContentVerdicts`/`putContentVerdict` round-trip (add a `pg-store.test.ts` case or a store fake test).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/agents.ts packages/db/drizzle/ apps/worker/src/mail/store.ts apps/worker/src/mail/pg-store.ts apps/worker/src/mail/pg-store.test.ts
git commit -m "feat(db): agent_content_verdicts cache table + store (RLS-scoped)"
```

---

## Task 12: Wire the cache into dry-run + worker

**Files:**
- Create/modify: `packages/core/src/content-eval.ts` (add `clauseHash`)
- Modify: `apps/api/src/routes/agents-ai.ts`, `apps/worker/src/consumers/agent-run.ts`

- [ ] **Step 1: Add `clauseHash(plan)` to `content-eval.ts` (+ test)**

```ts
import { contentClauses, type AgentPlan } from './agent-plan'

/** Stable, dependency-free hash of a plan's normalized content-clause values. */
export function clauseHash(plan: AgentPlan): string {
  const normalized = contentClauses(plan)
    .map((c) => c.value.trim().toLowerCase())
    .sort()
    .join('\n')
  let h = 5381
  for (let i = 0; i < normalized.length; i++) h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0
  return h.toString(36)
}
```

Test: same value for reordered/differently-cased clauses; different value for different content.

- [ ] **Step 2: Use the cache in the worker** (`agent-run.ts`): before the `needsAi` loop, `const hash = clauseHash(plan); const cached = await deps.mail.getContentVerdicts(userId, needsAi.map(t => t.id), hash)`. For each thread: if cached has it, use it; else classify and `putContentVerdict(userId, thread.id, hash, verdict, 'triage')`. Add `getContentVerdicts`/`putContentVerdict` to the `AgentRunDeps.mail` `Pick<...>`.

- [ ] **Step 3: Use the cache in the API dry-run** (`agents-ai.ts`): pre-load `getContentVerdicts` for all `needsAi` ids (needs a store or a direct `tx` query on `agentContentVerdicts`). Cached-true threads go straight into `matched` and do NOT count against `PREVIEW_AI_CAP`; only uncached threads consume the sample budget, and their verdicts are written back.

- [ ] **Step 4: Tests** — a second dry-run and a second worker run reuse verdicts: assert zero new classifier calls (spy the fake LLM / getThread call count).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agents): reuse cached content verdicts across dry-run + runtime"
```
