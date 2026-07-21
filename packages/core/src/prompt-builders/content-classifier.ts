/**
 * Content classifier — the AI half of a hybrid forwarding-rule condition.
 *
 * A rule's `content` clause carries a short natural-language predicate ("an
 * invoice or receipt"). After the cheap structured predicate has selected a
 * candidate thread, the worker runs THIS prompt over the candidate's decrypted
 * body + attachment text to decide, conservatively, whether it matches. The model
 * returns strict JSON `{ "match": boolean }`; callers treat any failure as no-match
 * (fail-closed) so an uncertain classification never auto-forwards private mail.
 */

import type { PromptMessage } from '../prompts'

export interface ContentClassifierPrompt {
  system: string
  messages: PromptMessage[]
}

/** Cap on the content we hand the model — keeps the prompt (and cost) bounded. */
const MAX_CONTENT_CHARS = 12000

/** JSON-schema constraint mirroring the `{ match: boolean }` return shape. */
export const CONTENT_CLASSIFIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['match'],
  properties: { match: { type: 'boolean' } },
} as const

/** Build the classifier prompt for one candidate message against a rule predicate. */
export function buildContentClassifierPrompt(
  text: string,
  predicate: string,
): ContentClassifierPrompt {
  return {
    system:
      'You decide whether an email — its body and any attachment text — matches a ' +
      'user-defined rule. Return ONLY strict JSON of the form {"match": true} or ' +
      '{"match": false}. Be conservative: answer true only when the message clearly ' +
      'matches the rule. Never add prose or a code fence.',
    messages: [
      {
        role: 'user',
        content:
          `Rule: the message is ${predicate}.\n\n` +
          `Email content:\n"""\n${text.slice(0, MAX_CONTENT_CHARS)}\n"""\n\n` +
          `Does it match the rule? Return {"match": boolean}.`,
      },
    ],
  }
}
