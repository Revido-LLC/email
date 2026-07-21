import { describe, expect, it } from 'vitest'
import {
  buildContentClassifierPrompt,
  CONTENT_CLASSIFIER_SCHEMA,
} from './content-classifier'

describe('buildContentClassifierPrompt', () => {
  it('embeds the predicate and the content, and asks for strict JSON', () => {
    const p = buildContentClassifierPrompt('Invoice total: €120', 'an invoice or receipt')
    expect(p.system).toMatch(/strict JSON/i)
    expect(p.system).toMatch(/"match"/)
    expect(p.messages).toHaveLength(1)
    expect(p.messages[0]!.role).toBe('user')
    expect(p.messages[0]!.content).toContain('an invoice or receipt')
    expect(p.messages[0]!.content).toContain('Invoice total: €120')
  })

  it('truncates very long content to keep the prompt bounded', () => {
    const long = 'x'.repeat(20000)
    const p = buildContentClassifierPrompt(long, 'a contract')
    expect(p.messages[0]!.content.length).toBeLessThan(13000)
  })

  it('exposes a boolean-match JSON schema', () => {
    expect(CONTENT_CLASSIFIER_SCHEMA.required).toEqual(['match'])
    expect(CONTENT_CLASSIFIER_SCHEMA.properties.match.type).toBe('boolean')
  })
})
