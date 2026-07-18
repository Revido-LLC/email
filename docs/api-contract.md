# Revido Mail — API contract

**Status:** the built contract — `apps/api` implements this Hono route surface and `apps/web`
consumes it via React Query hooks. This doc is the source of truth, kept in sync with the
shipped code.

## Purpose

In dev the web app renders over `@revido/mock-data`: a typed fake mailbox shaped like this API
(`packages/mock-data/src/types.ts` mirrors `packages/db/src/domain.ts` field-for-field). This
document is the real endpoint surface `apps/api` now implements:

- **The mock's 14 getter functions** (`packages/mock-data/src/index.ts`) map one-to-one to 14 read
  endpoints.
- **Every place the UI mutates local React state** to simulate an action — archiving, sending,
  approving, toggling an agent, saving a signature — is backed by a write endpoint.
- **The AI, agent, OAuth, webhook, and lead surfaces**, which have no mock stand-in at all
  because they don't fit a "read fake data" model, are built from the product plan
  (`docs/information-architecture.md`) and the shapes defined in
  `packages/core/src/agent-plan.ts`.

This is the source of truth for the Hono route surface in `apps/api` and the React Query hook
names in `apps/web`. It replaces the "~41 mutations" folklore figure referenced in
`apps/api/src/index.ts`'s header comment with a checked-in, counted list (see
[Coverage summary](#coverage-summary)).

Domain types referenced below (`Thread`, `Message`, `Account`, …) are from `packages/db/src/domain.ts`,
re-exported as `@revido/db`. Screen/component paths are relative to `apps/web/src/`.

## Conventions

- All ids are opaque strings; all timestamps are ISO 8601 strings — matches the mock exactly, so
  no format migration is needed when swapping data sources.
- Every route below is implicitly scoped to the authenticated user (session cookie); no route
  takes a `userId` param.
- Mutation responses return the updated resource (or a small `{ ok }`-shaped ack for
  fire-and-forget actions) so React Query can patch its cache directly instead of refetching.
- List reads that can grow unbounded (`GET /threads/*`) should accept `cursor`/`limit` query params
  in the real API; omitted below for brevity since the mock has no pagination to mirror.
- Errors follow Hono's standard JSON error shape; 404 for missing single-resource reads (`getThread`,
  `getAgent`, `getAccount` all return `undefined` in the mock — that's a 404 in the real API, not a
  200 with a null body).

---

## Reads (getters)

### Threads & Messages

| Mock function                    | Method & path                         | Response    | Consuming screens                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getThread(id)`                  | `GET /threads/:id`                    | `Thread`    | `routes/app.thread.$threadId.tsx`, `components/agents/approval-card.tsx`, `components/shell/ai-panel.tsx`                                                                                                                        |
| `getMessages(threadId)`          | `GET /threads/:id/messages`           | `Message[]` | `routes/app.thread.$threadId.tsx`, `components/shell/ai-panel.tsx` (`ThreadInsights` message count)                                                                                                                              |
| `getThreadsByCategory(category)` | `GET /categories/:categoryId/threads` | `Thread[]`  | `routes/app.category.$categoryId.tsx`                                                                                                                                                                                            |
| `getNeedsYou()`                  | `GET /threads/needs-you`              | `Thread[]`  | `routes/app.inbox.tsx`, `routes/app.index.tsx` ("Needs You"), `routes/app.thread.$threadId.tsx` (`j`/`k` sibling walk), `components/shell/nav-rail.tsx` (count)                                                                  |
| `getInboxByRecency()`            | `GET /threads?sort=recent`            | `Thread[]`  | reserved for an "all mail" recency view; no screen consumes it directly yet, but `ThreadList`'s "Recent" sort toggle (`components/inbox/thread-list.tsx`) implies the same query shape (`?sort=recent`) applied per-category too |

### Categories

| Mock function              | Method & path                              | Response                     | Consuming screens                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getUnreadCount(category)` | `GET /categories/:categoryId/unread-count` | `number`                     | reserved (no screen calls it directly today)                                                                                                                                                                                    |
| `getCategoryCounts()`      | `GET /categories/counts`                   | `Record<CategoryId, number>` | `components/shell/nav-rail.tsx` (category badges)                                                                                                                                                                               |
| _(none — static)_          | _n/a_                                      | `CategoryMeta[]`             | The 9 locked categories (`packages/mock-data/src/categories.ts` `CATEGORIES`/`CATEGORY_LIST`) are fixed product taxonomy, not per-user data — ship as a frontend constant in `@revido/db` or `@revido/ui`, not a live endpoint. |

### Agents & Agent Runs

| Mock function            | Method & path              | Response          | Consuming screens                                                                        |
| ------------------------ | -------------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `getAgent(id)`           | `GET /agents/:id`          | `AgentDef`        | `components/agents/create-agent-dialog.tsx` ("review before enable" wizard entry)        |
| `getEnabledAgents()`     | `GET /agents?enabled=true` | `AgentDef[]`      | reserved; the gallery (`routes/app.agents.tsx`) currently reads the full unfiltered list |
| `getAgentRuns(agentId?)` | `GET /agent-runs?agentId=` | `AgentRunEntry[]` | `routes/app.index.tsx` (Agent Report), `components/agents/activity-feed.tsx`             |

### Approvals

| Mock function               | Method & path          | Response | Consuming screens                       |
| --------------------------- | ---------------------- | -------- | --------------------------------------- |
| `getPendingApprovalCount()` | `GET /approvals/count` | `number` | `components/shell/nav-rail.tsx` (badge) |

### Reminders & Commitments

| Mock function      | Method & path      | Response       | Consuming screens                         |
| ------------------ | ------------------ | -------------- | ----------------------------------------- |
| `getReminders()`   | `GET /reminders`   | `Reminder[]`   | `routes/app.reminders.tsx`                |
| `getCommitments()` | `GET /commitments` | `Commitment[]` | `routes/app.index.tsx` (Your Commitments) |

### Accounts

| Mock function    | Method & path       | Response  | Consuming screens                                                         |
| ---------------- | ------------------- | --------- | ------------------------------------------------------------------------- |
| `getAccount(id)` | `GET /accounts/:id` | `Account` | reserved; `routes/app.settings.tsx` currently reads the full account list |

### Reads with no getter wrapper today

These are consumed directly from static `@revido/mock-data` exports (`export * from './data'`)
rather than through a function — the mock never needed a wrapper because the data was already a
plain array/object in module scope. A real API has no global array to import, so each of these
needs its own endpoint:

| Static export                                                              | Method & path                     | Response                                                               | Consuming screens                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APPROVALS`                                                                | `GET /approvals`                  | `Approval[]`                                                           | `routes/app.approvals.tsx` (queue seed), `routes/app.index.tsx` (`InlineApproval`)                                                                            |
| `AGENTS`                                                                   | `GET /agents`                     | `AgentDef[]`                                                           | `routes/app.agents.tsx` (gallery seed)                                                                                                                        |
| `ACCOUNTS`                                                                 | `GET /accounts`                   | `Account[]`                                                            | `routes/app.settings.tsx` (Accounts tab), `components/shell/nav-rail.tsx` (sync footer)                                                                       |
| `SIGNATURES`                                                               | `GET /signatures`                 | `Signature[]`                                                          | `routes/app.compose.tsx` (default signature), `routes/app.settings.tsx` (Signatures tab)                                                                      |
| `USER`                                                                     | `GET /me`                         | `Contact` (current user)                                               | pervasive: sender-exclusion in `thread-row.tsx`/`app.index.tsx`, `routes/app.settings.tsx` (Usage), `routes/talk.tsx` (form prefill), `routes/onboarding.tsx` |
| `TODAY_BRIEF`                                                              | `GET /today`                      | `TodayBrief`                                                           | `routes/app.index.tsx`, `components/shell/ai-panel.tsx` (`DayInsights`)                                                                                       |
| `ONBOARDING_SCAN`                                                          | `GET /onboarding/scan`            | `OnboardingScanResult`                                                 | `routes/onboarding.tsx` ("reading" stage counters)                                                                                                            |
| `AGENT_PROPOSALS`                                                          | `GET /onboarding/agent-proposals` | `AgentProposal[]`                                                      | `routes/onboarding.tsx` (proposals step)                                                                                                                      |
| `COUNTERS` (hardcoded in `app.settings.tsx`, not from `@revido/mock-data`) | `GET /usage`                      | `{ aiDrafts: number; agentRuns: number; chatQueries: number }`         | `routes/app.settings.tsx` (Usage tab)                                                                                                                         |
| _(none — hardcoded `AI_PREFS` defaults in `app.settings.tsx`)_             | `GET /settings/ai`                | `{ drafts: boolean; agents: boolean; chat: boolean; digest: boolean }` | `routes/app.settings.tsx` (AI tab initial toggle state)                                                                                                       |

---

## Writes (mutations)

### Threads

| Method & path                         | Request                                  | Response                 | Screen / component                                                                                                                                                    | Hook                     |
| ------------------------------------- | ---------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `POST /threads/:id/archive`           | —                                        | `Thread`                 | `components/inbox/thread-row.tsx` (row action, key `e`), `components/thread/thread-topbar.tsx` (`onArchive`), `routes/app.thread.$threadId.tsx` (`archiveAndAdvance`) | `useArchiveThread`       |
| `POST /threads/:id/snooze`            | `{ snoozedUntil: string }`               | `Thread`                 | `components/inbox/thread-row.tsx` (row action, key `h`), `components/thread/thread-topbar.tsx` (snooze icon)                                                          | `useSnoozeThread`        |
| `POST /threads/batch/archive`         | `{ threadIds: string[] }`                | `{ archived: string[] }` | `components/inbox/thread-list.tsx` (`archiveSelected`, batch bar)                                                                                                     | `useArchiveThreads`      |
| `POST /threads/batch/label`           | `{ threadIds: string[]; label: string }` | `{ updated: string[] }`  | `components/inbox/thread-list.tsx` (batch bar "Label")                                                                                                                | `useLabelThreads`        |
| `POST /threads/batch/mark-read`       | `{ threadIds: string[] }`                | `{ updated: string[] }`  | `components/inbox/thread-list.tsx` (batch bar "Mark read")                                                                                                            | `useMarkThreadsRead`     |
| `PATCH /threads/:id`                  | `{ starred: boolean }`                   | `Thread`                 | `components/thread/thread-topbar.tsx` (dropdown "Star / Unstar")                                                                                                      | `useToggleThreadStar`    |
| `PATCH /threads/:id`                  | `{ unread: boolean }`                    | `Thread`                 | `components/thread/thread-topbar.tsx` (dropdown "Mark as unread")                                                                                                     | `useMarkThreadUnread`    |
| `PATCH /threads/:id`                  | `{ labels: string[] }`                   | `Thread`                 | `components/thread/thread-topbar.tsx` (dropdown "Move to…", Tag icon)                                                                                                 | `useMoveThread`          |
| `PATCH /threads/:id`                  | `{ muted: boolean }`                     | `Thread`                 | `components/thread/thread-topbar.tsx` (dropdown "Mute thread")                                                                                                        | `useMuteThread`          |
| `DELETE /threads/:id`                 | —                                        | `{ deleted: true }`      | `components/thread/thread-topbar.tsx` (dropdown "Delete")                                                                                                             | `useDeleteThread`        |
| `PATCH /threads/:id/extracted/:index` | `{ done: boolean }`                      | `Thread`                 | `components/thread/thread-summary-card.tsx`, `components/shell/ai-panel.tsx` (`ThreadInsights` action-item checkbox)                                                  | `useToggleExtractedFact` |

The four `PATCH /threads/:id` rows share one endpoint with a partial body — listed separately
because each is a distinct UI affordance with its own hook. Star/mark-unread/move/mute are present
in `thread-topbar.tsx`'s dropdown menu as unwired stub items (no local state backs them in the
mock); they're included because the product plan and this task's scope name them explicitly
("star, label, move" — `docs/information-architecture.md` §1 Tier 2) as required surface, not
because the mock simulates them today.

### Messages & composer

| Method & path                    | Request                                                                                                                   | Response              | Screen / component                                                                         | Hook                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| `POST /messages`                 | `{ threadId?: string; to: Contact[]; subject: string; html: string; attachmentIds: string[]; remindIfNoReply?: boolean }` | `Message`             | `routes/app.compose.tsx` (`handleSend`, ⌘↵)                                                | `useSendMessage`      |
| `POST /messages/:id/cancel`      | —                                                                                                                         | `{ cancelled: true }` | `components/composer/undo-toast.tsx` (`onUndo`, 10s window)                                | `useCancelSend`       |
| `POST /threads/:id/reply`        | `{ html: string }`                                                                                                        | `Message`             | `components/thread/reply-zone.tsx` (Send button under quick-reply / full-draft preview)    | `useReplyToThread`    |
| `POST /attachments`              | `multipart/form-data`                                                                                                     | `Attachment`          | `components/composer/attachments-zone.tsx` (`AttachmentsZone` drop target, `AttachButton`) | `useUploadAttachment` |
| `POST /messages/:id/load-images` | —                                                                                                                         | `{ html: string }`    | `components/thread/message-item.tsx` ("Show images")                                       | `useLoadRemoteImages` |

### AI

| Method & path            | Request                                                    | Response                                                             | Screen / component                                                                                                                                                        | Hook                |
| ------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `POST /ai/draft`         | `{ threadId?: string; prompt: string }`                    | `{ scenarioId: string; paragraphs: string[] }`                       | `components/composer/prompt-bar.tsx` (submit), `components/thread/reply-zone.tsx` ("Write full draft"), `components/shell/ai-panel.tsx` ("Use draft" in `ThreadInsights`) | `useAiDraft`        |
| `POST /ai/rewrite`       | `{ threadId?: string; scenarioId: string; tone: ToneKey }` | `{ paragraphs: string[] }`                                           | `components/composer/tone-chips.tsx` (`onTone`)                                                                                                                           | `useAiRewrite`      |
| `POST /ai/quick-replies` | `{ threadId: string }`                                     | `{ replies: string[] }`                                              | `components/thread/reply-zone.tsx` (chip row, currently `quickReplies()` hardcoded per `thread.id`)                                                                       | `useAiQuickReplies` |
| `POST /ai/chat`          | `{ threadId?: string; message: string }`                   | `{ text: string; citations: { threadId: string; label: string }[] }` | `components/shell/ai-panel.tsx` (`ChatTab`, `send()`)                                                                                                                     | `useAiChat`         |

Triage (categorize + score + extract facts on ingest) and thread/day summarization are
worker-internal steps (they run automatically as mail arrives — see `apps/worker`) and are
deliberately **not** exposed as callable endpoints; the frontend only ever reads their output via
`Thread.tldr`/`summary`/`extracted` and `TodayBrief`.

### Agents

| Method & path          | Request                                                  | Response                                        | Screen / component                                                                                                                           | Hook              |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `POST /agents/compile` | `{ description: string }`                                | `AgentPlan` (`packages/core/src/agent-plan.ts`) | `components/agents/create-agent-dialog.tsx` (`compileAndAdvance`, mirrors the client-only `compilePlan()` in `components/agents/compile.ts`) | `useCompileAgent` |
| `POST /agents/dry-run` | `{ plan: AgentPlan }`                                    | `{ matches: Thread[] }`                         | `components/agents/create-agent-dialog.tsx` (`DryRun` step, mirrors `dryRunMatch()`)                                                         | `useDryRunAgent`  |
| `POST /agents`         | `{ name: string; description: string; plan: AgentPlan }` | `AgentDef`                                      | `components/agents/create-agent-dialog.tsx` ("Create & enable" → `onCreate`) → `routes/app.agents.tsx` (`handleCreate`)                      | `useCreateAgent`  |
| `PATCH /agents/:id`    | `{ enabled: boolean }`                                   | `AgentDef`                                      | `components/agents/agent-card.tsx` (Switch, `onToggle`), `routes/app.agents.tsx` (`toggle`, `enableExisting`), wizard "Enable agent" step    | `useToggleAgent`  |
| `DELETE /agents/:id`   | —                                                        | `{ deleted: true }`                             | Planned (`docs/information-architecture.md` §1 Tier 3 "Pause / delete an agent"); no button wired in the mock yet                            | `useDeleteAgent`  |

### Agent runs

| Method & path               | Request | Response        | Screen / component                                                | Hook              |
| --------------------------- | ------- | --------------- | ----------------------------------------------------------------- | ----------------- |
| `POST /agent-runs/:id/undo` | —       | `AgentRunEntry` | `components/agents/activity-feed.tsx` (`ActivityEntry`, `onUndo`) | `useUndoAgentRun` |

### Approvals

| Method & path                   | Request                                               | Response                   | Screen / component                                                                                                                     | Hook                       |
| ------------------------------- | ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `POST /approvals/:id/approve`   | —                                                     | `{ resolved: 'approved' }` | `components/agents/approval-card.tsx` (`onApprove`), `routes/app.approvals.tsx` (`resolve`), `routes/app.index.tsx` (`InlineApproval`) | `useApproveApproval`       |
| `POST /approvals/:id/reject`    | —                                                     | `{ resolved: 'rejected' }` | same as above (`onReject`)                                                                                                             | `useRejectApproval`        |
| `POST /approvals/:id/approve`   | `{ editedPreview: string }`                           | `{ resolved: 'edited' }`   | `components/agents/approval-card.tsx` (edit textarea, `onConfirmEdit`)                                                                 | `useApproveEditedApproval` |
| `POST /approvals/batch-approve` | `{ agentId?: string }` (omitted = approve everything) | `{ resolved: string[] }`   | `routes/app.approvals.tsx` ("Batch approve" dropdown, "Approve everything", `batchApprove`)                                            | `useBatchApproveApprovals` |

### Reminders

| Method & path                     | Request             | Response         | Screen / component                                       | Hook                |
| --------------------------------- | ------------------- | ---------------- | -------------------------------------------------------- | ------------------- |
| `POST /reminders/:id/send-chaser` | —                   | `{ sent: true }` | `routes/app.reminders.tsx` (`ChaserBlock` "Send chaser") | `useSendChaser`     |
| `POST /reminders/:id/snooze`      | `{ until: string }` | `Reminder`       | `routes/app.reminders.tsx` (`ChaserBlock` "Snooze")      | `useSnoozeReminder` |

### Accounts

| Method & path          | Request | Response           | Screen / component                                                               | Hook                   |
| ---------------------- | ------- | ------------------ | -------------------------------------------------------------------------------- | ---------------------- |
| `DELETE /accounts/:id` | —       | `{ purged: true }` | `routes/app.settings.tsx` (`DisconnectDialog`, "Disconnect + delete everything") | `useDisconnectAccount` |

(`POST /auth/oauth/:provider/start` also creates the account — see Auth / OAuth below — so it is
not duplicated here.)

### Settings

| Method & path                     | Request                                                                    | Response                                                               | Screen / component                                                             | Hook                     |
| --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `PATCH /settings/ai`              | `{ drafts?: boolean; agents?: boolean; chat?: boolean; digest?: boolean }` | `{ drafts: boolean; agents: boolean; chat: boolean; digest: boolean }` | `routes/app.settings.tsx` (`AiTab`, per-row Switch)                            | `useUpdateAiPreferences` |
| `PUT /signatures/:id`             | `{ html: string }`                                                         | `Signature`                                                            | `routes/app.settings.tsx` (`SignaturesTab`, "Save signature")                  | `useSaveSignature`       |
| `POST /account/delete-everything` | —                                                                          | `{ deleted: true }`                                                    | `routes/app.settings.tsx` (`DeleteEverythingDialog`, "Yes, delete everything") | `useDeleteEverything`    |

### Onboarding

| Method & path             | Request                  | Response     | Screen / component                                                                                     | Hook                      |
| ------------------------- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------- |
| `POST /onboarding/agents` | `{ agentIds: string[] }` | `AgentDef[]` | `routes/onboarding.tsx` (`ProposalsView`, "Continue to your inbox" — enables the toggled-on proposals) | `useEnableProposedAgents` |

### Leads

| Method & path | Request                                                              | Response         | Screen / component              | Hook            |
| ------------- | -------------------------------------------------------------------- | ---------------- | ------------------------------- | --------------- |
| `POST /leads` | `{ name: string; email: string; company: string; automate: string }` | `{ id: string }` | `routes/talk.tsx` (form submit) | `useSubmitLead` |

### Auth / OAuth

| Method & path                        | Request                | Response                                                                | Screen / component                                                                                                               | Hook                                |
| ------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `POST /auth/oauth/:provider/start`   | —                      | `{ redirectUrl: string }`                                               | `components/landing/oauth-buttons.tsx` ("Continue with Google/Microsoft"), `routes/app.settings.tsx` ("Connect another account") | `useStartOAuth`                     |
| `GET /auth/oauth/:provider/callback` | query: `code`, `state` | 302 → `/onboarding` (creates the `Account`, kicks off the initial sync) | provider redirect target; feeds `routes/onboarding.tsx`'s "Connecting…" stage                                                    | — (server redirect, no client hook) |

`:provider` is `gmail \| outlook`, matching the `Provider` union in `packages/db/src/domain.ts`.

### Sync

No dedicated frontend-facing endpoints. `Account.syncProgress`/`syncLabel` (read via `GET /accounts`
/ `GET /accounts/:id`) are the only sync data the UI consumes — see `components/shell/nav-rail.tsx`'s
footer progress bar and `routes/app.settings.tsx`'s `AccountsTab`. The backfill itself starts
automatically after the OAuth callback and is tracked server-side in the `sync_state` table
(`packages/db/src/schema.ts`); it is a worker job, not something the frontend triggers or polls via
its own route.

### Webhooks

| Method & path          | Request                                                                                                                     | Response                                                  | Notes                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /webhooks/gmail` | Gmail Pub/Sub push envelope                                                                                                 | `200`                                                     | Provider-push ingestion trigger for `apps/worker`; no UI consumes this directly — it's what keeps `Thread`/`Message` data fresh between polls. |
| `POST /webhooks/graph` | Microsoft Graph change notification (+ the `validationToken` query-param handshake Graph requires on subscription creation) | `200` (echoes `validationToken` on the handshake request) | Same role as the Gmail webhook, for Outlook accounts.                                                                                          |

---

## Coverage summary

|                                                                                                                                                 | Count  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Reads — mirror the mock's getter functions 1:1                                                                                                  | 14     |
| Reads — needed for data the UI reads directly, with no getter wrapper (8 static `@revido/mock-data` exports + 2 hardcoded route-local literals) | 10     |
| **Total read endpoints**                                                                                                                        | **24** |
| Writes — Threads                                                                                                                                | 11     |
| Writes — Messages & composer                                                                                                                    | 5      |
| Writes — AI                                                                                                                                     | 4      |
| Writes — Agents                                                                                                                                 | 5      |
| Writes — Agent runs                                                                                                                             | 1      |
| Writes — Approvals                                                                                                                              | 4      |
| Writes — Reminders                                                                                                                              | 2      |
| Writes — Accounts                                                                                                                               | 1      |
| Writes — Settings                                                                                                                               | 3      |
| Writes — Onboarding                                                                                                                             | 1      |
| Writes — Leads                                                                                                                                  | 1      |
| Writes — Auth / OAuth                                                                                                                           | 2      |
| Writes — Webhooks                                                                                                                               | 2      |
| **Total write endpoints**                                                                                                                       | **42** |

The real count of distinct write endpoints found by walking every route and component under
`apps/web/src` is **42** — not the "~41" figure carried in `apps/api/src/index.ts`'s header
comment. That comment should be updated to point at this document instead of restating a number.
