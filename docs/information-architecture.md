# Revido Mail — Information Architecture

**Scope:** the complete structural blueprint of the product — what exists, how it's named,
how users move through it, and what gets designed first. Validated against the locked product
plan, the built route tree (`apps/web/src/routes/`), and the shipped taxonomy
(`packages/mock-data/src/categories.ts`).

**Product in one line:** a free web email client where AI triages, drafts, and acts on your
mail — built as the live demo of Revido's agency work. Every structural decision below serves
one of two loops:

- **Habit loop** (retention): list → thread → reply → archive → next. Must be faster than Gmail.
- **Wow loop** (business goal): AI does visible work → user notices → contextual CTA → lead.

The wow loop is *embedded inside* the habit loop (TL;DRs on rows, Agent Report on Today,
inline approvals) — it is never a separate wing the user must remember to visit.

---

## 1. Content inventory

Everything the user must **find, do, or understand**, grouped by real frequency of use.
Frequency drives placement: continuous items live on persistent chrome, daily items are one
keystroke away, rare items may be buried without harm.

### Tier 1 — Continuous (many times per hour, during a session)

| Item | Type | Where it must live |
| --- | --- | --- |
| Thread list with sender / subject / **AI TL;DR** | find | Center stage — default work surface |
| Open a thread, read latest message | do | Full-screen takeover, `Enter` |
| Reply (quick-reply chips, prompt-bar draft) | do | Bottom of takeover, `r` |
| Archive / advance | do | `e`, auto-advance — zero-click |
| Priority ("does this need me?") | understand | Priority dot + "Needs You" sort — pre-answered per row |
| Search anything | find | `Cmd-K`, everywhere |
| Category of a thread | understand | Color-coded chip on every row |
| Unread / count states | understand | Nav rail counts |

### Tier 2 — Daily (1–3 times per day)

| Item | Type | Where it must live |
| --- | --- | --- |
| Today brief (what needs me, what agents did, what to ignore) | understand | Home screen (`/app`) |
| Approve / reject agent actions | do | Approvals queue + inline on Today |
| Compose new mail (incl. from prompt) | do | `c`, persistent nav button |
| Follow-up nudges & deadline reminders | find/do | Reminders + Commitments card on Today |
| Chat with inbox ("what did John say about…") | find | AI panel, Chat tab, `Cmd-J` |
| Snooze / remind-me | do | Row hover + takeover actions, `h` |
| Star, label, move | do | Takeover top bar, `l` |
| Sync progress ("still importing older mail") | understand | Nav rail footer, passive |

### Tier 3 — Weekly (maintenance & setup)

| Item | Type | Where it must live |
| --- | --- | --- |
| What my agents did (activity feed / audit log) | understand | Agents → Activity |
| Create or tune an agent (NL rule → plan → dry run) | do | Agents → gallery + "What should we automate?" |
| Pause / delete an agent, review run history | do | Agents → detail view |
| Batch triage of a bulk category (Newsletters, Promotions) | do | Category views |
| Unsubscribe sweep | do | Unsubscriber agent (not a manual surface) |

### Tier 4 — Rare (once, or a few times ever)

| Item | Type | Where it must live |
| --- | --- | --- |
| Sign up / connect Gmail or Outlook | do | Landing → OAuth → Onboarding |
| Understand what the AI does with my mail (trust) | understand | Landing trust strip, Trust page, sparkle glyph convention |
| Accept/skip proposed agents at onboarding | do | Onboarding step 3 |
| Add second account, signatures, digest email opt-in, AI toggles | do | Settings |
| Disconnect + delete everything (provable purge) | do | Settings → Privacy — rare but must be *findable in one try* (trust is the product) |
| Hire Revido ("build this for my company") | do | Contextual CTAs → Talk to Revido |

**Placement rule derived from the inventory:** Tier 1 must cost 0–1 keystrokes, Tier 2 exactly
one navigation act, Tier 3 one nav act + one in-page choice, Tier 4 may take up to three — except
*delete everything*, which gets Tier-2 findability despite Tier-4 frequency, because failing to
find it destroys the trust positioning.

---

## 2. Navigation hierarchy

Maximum 3 levels. Names below are the **shipped labels** (validated user vocabulary), with the
corporate alternatives they deliberately replace.

```
LEVEL 0 — persistent shell (always visible)
├── Compose  (button, `c`)
├── Account switcher (avatar)
├── Cmd-K  — search + actions, overlays everything
├── AI panel (Cmd-J) ── tabs: Insights · Chat
└── "Built by Revido" card (nav footer, dismissible)

LEVEL 1 — nav rail (top → bottom)
├── Today                        ← home; NOT "Dashboard"
├── Needs You         (count)    ← NOT "Priority Inbox" / "Focused"
├── Approvals         (badge)    ← NOT "Pending Actions"
├── Categories ▾                 (collapsible group)
│   ├── To Reply        · coral      LEVEL 2
│   ├── Awaiting Reply  · amber
│   ├── FYI             · gray
│   ├── Newsletters     · lavender
│   ├── Notifications   · slate
│   ├── Promotions      · pink
│   ├── Receipts        · green
│   ├── Calendar        · sky
│   └── Personal        · teal
├── Reminders
├── Agents
├── Provider labels/folders ▾    (collapsed; Gmail/Outlook natives)  LEVEL 2
└── Settings                     (bottom, with sync indicator)

LEVEL 2/3 — content
└── Thread list (any view) → Thread takeover → message expand / composer
```

### Vocabulary decisions (user words vs. corporate words)

| Chosen | Rejected | Why |
| --- | --- | --- |
| **Needs You** | Priority Inbox, Focused, Important | Answers the user's actual question ("does this need me?") instead of describing an algorithm. |
| **To Reply / Awaiting Reply** | Action Required / Pending Response | The words people say out loud: "I still have to reply to her," "I'm waiting on him." |
| **Can Ignore** (Today card) | Low Priority | Gives explicit *permission* — the emotional job of triage. |
| **Approvals** | Action Queue, Tasks | Matches the mental model: "my assistant asked me to sign off." |
| **Reminders** | Follow-ups & Deadlines | One everyday word covering both. |
| **Receipts** | Receipts/Invoices | ⚠ Open item: plan said "Receipts/Invoices"; nav shipped "Receipts". ICP (founders/freelancers) hunts *invoices* specifically — recommend keeping the label "Receipts" but making "invoice" a first-class search synonym and badge (`💰 $1,240` already does this on rows). |
| **Agents** | Automations, Workflows, Rules | Borderline-corporate but deliberately kept: it's the demo of Revido's agent business, and the 2026 ICP knows the word. Softened everywhere by plain-verb framing: "What should we automate?" |
| **Talk to Revido** | Contact Sales | A conversation, not a pipeline stage. |

**Depth check:** every destination in the product is reachable in ≤2 clicks from the rail, or
≤2 keystrokes via Cmd-K / `g`-shortcuts (`g t` Today, `g i` Needs You, `g a` Agents). No level 4 exists.

---

## 3. Primary flows

The five paths that carry nearly all the value. Numbered from entry point to completed objective.

### Flow A — First run: stranger → triaged inbox (< 60 s) ★ make-or-break

1. Land on `mail.revido.co` — hero "Your inbox, handled", trust strip, single decision.
2. Click **Continue with Google / Microsoft** → one OAuth consent (identity + mail together).
3. Setup screen: live stages animate with **their real data** — "12 need replies · 34 newsletters · 3 invoices found."
4. Agent proposals (≤3 cards, generated from the scan): toggle on or skip. *Skippable is non-negotiable.*
5. Arrive on **Today** with first brief + 3-stop tooltip tour (takeover, AI panel, Cmd-K).
6. Objective complete: user has seen AI do real work on *their* mail before the backfill even finishes.

### Flow B — Daily session: open app → inbox zero

1. Open app → **Today**: stat strip ("6 need you · 3 promises to keep · agents handled 24").
2. Approve overnight agent actions inline on the Agent Report card.
3. `g i` → **Needs You** list.
4. `j/k` walk rows reading TL;DRs — most threads die here: `e` archive without opening.
5. `Enter` on the ones that matter → Flow C.
6. Empty list → inbox-zero celebration (+ soft Revido line). Objective: control, in minutes.

### Flow C — Read & reply: thread → sent (< 30 s)

1. Open thread → **pinned AI summary** answers "what's this about?" without scrolling.
2. Extracted fact chips (dates, amounts, action items) — scan, don't read.
3. Pick a **quick-reply chip**, or type intent into the prompt bar → draft streams in, in your voice.
4. Edit the draft (always editable — never auto-send).
5. `Cmd-Enter` send → 10 s undo toast → asked a question? auto-offer "remind me if no reply in 3 days."
6. Auto-advance to next thread. Objective: reply sent, follow-up armed, zero context lost.

### Flow D — Create an agent: intent → trusted automation

1. **Agents** → gallery card *or* type into "What should we automate?"
2. AI compiles the rule → **plan card**: Trigger / Conditions / Actions / Needs approval?
3. **Dry run** against the last 30 days: "would have affected 34 emails — review them."
4. Review the list, adjust, name it, **enable**.
5. Next morning: results appear in Today's Agent Report → first approval → Flow E.
6. Objective: user delegated real work to AI and *watched it prove itself first*.

### Flow E — Approval loop: agent asks → human signs off (the trust engine + lead engine)

1. Agent queues a consequential action (send / unsubscribe / delete) — never auto-runs it.
2. **Approvals** badge appears in nav; batch also surfaces inline on Today.
3. Open card stack: `a` approve · `x` reject · `e` edit-then-approve; batch-approve per agent.
4. Same pattern approved repeatedly → offer "always allow this" (graduated autonomy).
5. After a visible milestone ("Unsubscriber cleaned 34 lists") → frequency-capped CTA → **Talk to Revido** (prefilled) → lead.
6. Objective: user retains veto power; Revido gets its warmest conversion moment.

---

## 4. Anticipated friction points

The four moments most likely to lose the user, why, and the structural mitigation.

### F1 — The OAuth consent wall (worst funnel killer)
**Moment:** Flow A step 2. An unknown free product asks for *full mailbox access* — Google's own
scary-permissions screen, off-brand and unskippable.
**Why users bail:** maximal ask, zero demonstrated value, "why does a free tool want everything?"
**Mitigation:** trust strip *before* the click ("Free · your mail never trains AI models · delete
everything anytime"), open-source + CASA audit named on landing, one combined consent instead of
two, and CTA copy that sets expectations ("Connect your inbox" — not "Sign up").

### F2 — Setup dead air (the 15–30 s sync gap)
**Moment:** Flow A step 3. If the screen shows a generic spinner, the wow window closes.
**Why users bail:** waiting on an unfamiliar product with no evidence anything is happening;
tab-switch → never returns.
**Mitigation:** newest-first sync so counts animate up from *their* data within seconds; the
setup screen **is** the first wow, not a loading state. Backfill continues passively behind the
nav-rail progress indicator — never blocks.

### F3 — The agent trust cliff
**Moment:** Flow D — authorizing software to act on real correspondence.
**Why users bail:** fear of irreversible embarrassment (wrong email unsubscribed, half-drafted
reply sent to a client). One bad surprise ends all AI trust, not just the agent's.
**Mitigation:** dry-run-before-enable as a mandatory step (show the blast radius), the safe/
consequential action split (Flow E), undo where reversible, sparkle glyph on everything
AI-touched, and an audit-grade activity feed.

### F4 — The day-2 cliff (habit gravity)
**Moment:** the second visit — or the one that never happens. Gmail muscle memory + browser
autofill pull users home.
**Why users bail:** novelty wow ≠ switching cost paid; if Today is stale or the backfill still
mid-flight, the product feels like a demo, not a client.
**Mitigation:** opt-in **daily digest email** captured during onboarding (a reason to come back
that arrives in the *old* inbox), follow-up reminders that fire on day 2–3 by design, and
keyboard parity so the speed habit transfers rather than resets.

*(Watchlist, not top-4: approval-queue nagging if agents over-ask — cap via "always allow";
quick-reply quality — a bad draft on the first try silently kills Flow C adoption.)*

---

## 5. Content taxonomy

The classification system that gets any item found in **≤ 3 clicks** (or ≤ 2 keystrokes).

### Categories (mutually exclusive, one per thread, AI-assigned on ingest)

| Category | Color | User's question it answers |
| --- | --- | --- |
| To Reply | coral | "What do I owe people?" |
| Awaiting Reply | amber | "What do people owe me?" |
| FYI | gray | "What should I know but not act on?" |
| Newsletters | lavender | "Where's my reading pile?" |
| Notifications | slate | "What did my apps tell me?" |
| Promotions | pink | "Where's the marketing noise?" |
| Receipts | green | "Where's that invoice/receipt?" |
| Calendar | sky | "What's scheduling-related?" |
| Personal | teal | "Where's mail from actual humans I know?" |

Note the design: the first two categories are *relationship states*, not topics — they encode
the reply debt in both directions, which is the ICP's core anxiety.

### Cross-cutting labels & badges (non-exclusive, stackable on any thread)

- **Priority dot** — needs-you score (drives Needs You sort)
- **Extracted-fact badges** — `📎 attachment` · `💰 amount` · `📅 date/deadline` · tracking number
- **State flags** — unread · starred · snoozed · reminder-armed · agent-touched (sparkle)
- **Provider labels/folders** — Gmail/Outlook natives, preserved read-only in a collapsed nav group (never remapped — users' existing systems must survive migration)

### Filters (within any thread list)

Account (when >1 connected) · category · unread · has-attachment · has-amount · date range ·
sort: priority ⇄ recency (toggle).

### Retrieval paths — the 3-click audit

| "Find the…" | Path | Cost |
| --- | --- | --- |
| Acme invoice from March | `Cmd-K` → "acme invoice" → result | 2 keystrokes + 1 click |
| Same, browsing | Receipts → scan green rows → open | 2 clicks |
| Email I forgot to answer | Needs You *or* To Reply → row | 2 clicks |
| Thing I snoozed | Reminders → Snoozed group | 2 clicks |
| What the AI did to my mail | Agents → Activity | 2 clicks |
| Flight confirmation, fuzzy memory | `Cmd-J` chat → "find my flight confirmation" → cited chip | 1 keystroke + 1 question |

**Escape-hatch rule:** anything not findable by browsing must be findable by asking — Cmd-K for
keyword-shaped queries, AI-panel Chat for question-shaped ones ("Ask AI →" handoff bridges the
two). Search is the taxonomy's safety net, which is why it lives on Level 0 chrome.

---

## 6. Screen map

Every view, its function, and its adjacencies. `→` = primary forward path.

### Outside the shell (unauthenticated / one-time)

| # | Screen | Route | Function | Adjacent |
| --- | --- | --- | --- | --- |
| S1 | Landing | `/` | Convert stranger to OAuth click; carry trust load | → OAuth → S2 |
| S2 | Onboarding | `/onboarding` | Live-triage wow + agent proposals | → S3 (Today) |
| S12 | Talk to Revido | `/talk` | Prefilled lead form → thank-you + booking | ← CTAs on S3/S8/zero-states |
| — | Design kitchen sink | `/design` | Internal: token/component QA surface | (dev only) |

### Inside the shell (3-zone layout: nav rail · center stage · AI panel)

| # | Screen | Route | Function | Adjacent |
| --- | --- | --- | --- | --- |
| S3 | **Today** | `/app` | Daily brief: stat strip, Needs You top-5, Commitments, Agent Report, Can Ignore | → S5 (thread), S9 (approvals), S4 (`g i`) |
| S4 | **Needs You** (thread list) | `/app/inbox` | Priority-sorted triage surface; TL;DR rows; batch actions | → S5; ↔ S4b |
| S4b | Category views | `/app/category/$categoryId` | Same list anatomy filtered to one category ×9 | → S5 |
| S5 | **Thread takeover** | `/app/thread/$threadId` | Full-screen read: pinned summary, fact chips, messages, quick-reply zone | `j/k` → next S5; `r` → S6; `esc` → back |
| S6 | Composer | `/app/compose` (+ inline in S5) | Prompt-bar AI drafting, tone chips, rich text, send + undo | → back to source; send → reminder offer |
| S7 | Agents | `/app/agents` | Gallery · NL create (plan card + dry run) · detail · activity feed | → S9; results → S3 |
| S9 | Approvals | `/app/approvals` | Card stack: `a/x/e`, batch per agent | ← badge, S3, S7; → S5 (context) |
| S10 | Reminders | `/app/reminders` | Follow-ups (pre-drafted chaser) · Deadlines · Snoozed | → S5, → S6 (send chaser) |
| S11 | Settings | `/app/settings` | Accounts + sync, AI preferences, signatures, notifications, Privacy (delete everything) | ← nav bottom; → OAuth (add account) |

### Overlays (no route — available everywhere in shell)

| Overlay | Trigger | Function |
| --- | --- | --- |
| Command palette | `Cmd-K` | Unified search (threads/contacts/attachments) + actions + "Ask AI →" |
| AI panel — Insights | `Cmd-J` | Context-reactive: day stats on Today; summary/facts/related on a thread |
| AI panel — Chat | `Cmd-J` → tab | Mailbox Q&A with cited, deep-linked answers |
| Undo toast | after send/archive | 10 s reversal window |
| Inbox-zero / empty states | list exhausted | Celebration + soft Revido line; sync skeletons |

**Structural notes:** S5 is the hub — every list, reminder, approval, and chat citation resolves
into a thread takeover; its `j/k` auto-advance is what makes the whole graph feel fast. S4/S4b
share one component (list anatomy) — nine category views cost one design. The AI panel is
deliberately *not* a screen: insights follow the user instead of being visited.

---

## 7. Prioritization by impact

Ranked by `usage volume × business impact (wow→lead) × dependency order`. This is both the
design order and the polish-budget allocation.

| Priority | Surface | Volume | Business impact | Rationale |
| --- | --- | --- | --- | --- |
| **P0-1** | Thread list rows (S4/S4b) + TL;DR anatomy | Highest — hundreds of glances/day | Quiet always-on wow | The row is the product's most-seen pixel. If triage isn't faster than Gmail, nothing downstream ever happens. |
| **P0-2** | Thread takeover (S5) + quick replies | Very high | AI-in-your-voice wow | Where reading and replying — the job of an email client — live. Auto-advance makes speed *felt*. |
| **P0-3** | Today (S3) | 1×/day, first thing | The daily wow ritual + CTA slot | The habit anchor and home for Agent Report. Cheap to build over list primitives once S4/S5 exist. |
| **P1-4** | Onboarding (S2) | Once per user | Decides if any user exists at all | Highest-stakes 30 seconds; forgivable-once but only converts if the live-count wow lands. |
| **P1-5** | Agents (S7) + Approvals (S9) | Weekly / daily-glance | **The headline demo of Revido's business** | Justifies the product's existence as lead-gen; dry-run + approval UX is the trust story investors of attention buy. |
| **P1-6** | Composer (S6) | Daily | Retention + writing wow | Prompt-bar drafting; quick-reply chips in S5 already cover the 80% case, so full composer can trail slightly. |
| **P2-7** | Landing (S1) | Once, pre-user | Funnel top | Must exist and carry trust copy; a focused hero beats an elaborate one. |
| **P2-8** | Reminders (S10), Settings (S11), Talk to Revido (S12) | Weekly / rare | Completeness + capture | S12 is tiny but is the conversion endpoint — build early, polish little. |

**The dependency spine:** design tokens + row anatomy → list → takeover → Today → everything
else. The AI panel and Cmd-K are chrome built alongside P0, not after.

**What "done first" buys:** P0 alone is a usable, wow-bearing email client (Flow B + C complete).
P1 adds the business model (Flows A, D, E). P2 completes the funnel's ends.

---

*Open items flagged during validation:* ① "Receipts" vs "Receipts/Invoices" labeling (see §2);
② Search has no dedicated results screen — Cmd-K is the only surface; acceptable for v1,
revisit if palette results overflow; ③ unified multi-account inbox is v1.5 — v1 IA assumes
per-account views via the account switcher.
