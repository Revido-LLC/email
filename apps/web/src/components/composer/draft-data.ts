/**
 * Composer draft helpers.
 *
 * The AI draft now streams from `POST /ai/draft` (and tone rewrites from
 * `POST /ai/rewrite`) rather than a scripted, canned reveal — so all this file
 * carries is the tone vocabulary the chips use and a small helper that turns the
 * plain-text token stream into the paragraph HTML the Tiptap editor renders.
 */

/** `default` is the freshly drafted body; the others are tone rewrites. */
export type ToneKey = 'default' | 'shorter' | 'friendlier' | 'formal'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Turn the plain-text draft accumulated from the token stream into paragraph
 * HTML. Blank lines separate paragraphs; single newlines become `<br>`.
 */
export function draftToHtml(text: string): string {
  const trimmed = text.replace(/\r/g, '')
  if (!trimmed.trim()) return ''
  return trimmed
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
