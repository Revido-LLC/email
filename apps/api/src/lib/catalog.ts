/**
 * Static product catalog: onboarding agent proposals and their prebuilt agent
 * templates.
 *
 * These are fixed product taxonomy (like the 9 locked categories), not per-user
 * data, so they live as a server constant rather than a table. `GET /onboarding/
 * agent-proposals` serves {@link AGENT_PROPOSALS}; `POST /onboarding/agents`
 * instantiates the matching {@link PREBUILT_AGENTS} template into the user's
 * `agents` table.
 */
import type { AgentAction, AgentProposal } from '@revido/db'

/** The proposal cards shown in onboarding (mirrors the mock `AGENT_PROPOSALS`). */
export const AGENT_PROPOSALS: AgentProposal[] = [
  {
    id: 'prop-digest',
    title: 'Bundle your newsletters',
    detail: 'Bundle your newsletters into one daily digest so they stop clogging your inbox.',
    icon: 'Newspaper',
    accent: 'newsletters',
    metric: 'newsletters',
  },
  {
    id: 'prop-chaser',
    title: 'Chase your no-replies',
    detail: 'A nightly agent that nudges the people who never replied to you.',
    icon: 'Send',
    accent: 'awaiting-reply',
    metric: 'awaiting reply',
  },
  {
    id: 'prop-invoice',
    title: 'Auto-file your invoices',
    detail: 'Auto-label invoices, extract their amounts, and file them by month.',
    icon: 'Receipt',
    accent: 'receipts',
    metric: 'vendors',
  },
]

/** A prebuilt agent definition a proposal instantiates. */
export interface PrebuiltAgentTemplate {
  name: string
  description: string
  icon: string
  accent: string
  trigger: string
  conditions: string[]
  actions: AgentAction[]
}

/** Proposal id → the agent it creates when enabled during onboarding. */
export const PREBUILT_AGENTS: Record<string, PrebuiltAgentTemplate> = {
  'prop-digest': {
    name: 'Newsletter digest',
    description: 'Bundles newsletters into one daily digest.',
    icon: 'Newspaper',
    accent: 'newsletters',
    trigger: 'new-mail',
    conditions: ['category is newsletters'],
    actions: [{ type: 'label', label: 'Add to daily digest', needsApproval: false }],
  },
  'prop-chaser': {
    name: 'Reply chaser',
    description: 'Nudges recipients who never replied.',
    icon: 'Send',
    accent: 'awaiting-reply',
    trigger: 'scheduled',
    conditions: ['awaiting-reply is true'],
    actions: [{ type: 'draft', label: 'Draft a follow-up nudge', needsApproval: true }],
  },
  'prop-invoice': {
    name: 'Invoice filer',
    description: 'Labels invoices and files them by month.',
    icon: 'Receipt',
    accent: 'receipts',
    trigger: 'new-mail',
    conditions: ['category is receipts'],
    actions: [{ type: 'label', label: 'File by month', needsApproval: false }],
  },
}

/** A rotating CTA line for wow-moment surfaces (mirrors the mock). */
export const REVIDO_CTA =
  'Want agents like these built for your whole team’s workflows? Talk to Revido →'
