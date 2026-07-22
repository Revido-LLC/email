/**
 * Chat retrieval re-ranking.
 *
 * The `message_embeddings` ANN gives semantic candidates, but pure cosine
 * distance can't answer "what's the LAST email about X" (no time signal) and
 * misses exact-term matches. Bodies + subjects are ciphertext at rest, so no
 * server-side FTS is possible — instead we pull a wider ANN candidate pool,
 * decrypt it, and re-rank here with a blend of:
 *   - semantic closeness (from the ANN distance),
 *   - recency (message date; plaintext, so orderable), weighted UP when the
 *     query reads as temporal ("last", "latest", "recent", …), and
 *   - keyword overlap on the now-decrypted subject + body (a lexical leg that
 *     the encrypted store can't do in SQL).
 *
 * Everything here is pure and deterministic given its inputs, so it is unit
 * tested without a DB or an LLM.
 */

/** A decrypted ANN candidate to be re-ranked. */
export interface RankableChunk {
  threadId: string
  subject: string
  text: string
  /** ISO timestamp of the underlying message (plaintext column). */
  date: string
  /** pgvector cosine distance (0 = identical, 2 = opposite). */
  distance: number
}

/**
 * Words that signal the user cares about *when* — recency should dominate the
 * ranking so "the last email about X" returns the newest match, not merely the
 * most semantically central one.
 */
const TEMPORAL_RE =
  /\b(last|latest|recent|recently|newest|new(?:est)?|today|yesterday|this\s+(?:week|month|morning)|just|earlier|current|now|up[\s-]?to[\s-]?date)\b/i

export function detectTemporalIntent(query: string): boolean {
  return TEMPORAL_RE.test(query)
}

/** Tokens worth matching lexically — 3+ alphanumerics, deduped, lowercased. */
function queryTerms(query: string): string[] {
  const terms = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
  return [...new Set(terms)]
}

/**
 * Fraction of distinct query terms that appear in the candidate's subject or
 * body (0..1). A cheap lexical signal that rescues exact-string matches ("ReaDI
 * Watch") the embedding may rank below fuzzier neighbours.
 */
export function keywordScore(query: string, subject: string, text: string): number {
  const terms = queryTerms(query)
  if (terms.length === 0) return 0
  const hay = `${subject} ${text}`.toLowerCase()
  const hits = terms.filter((t) => hay.includes(t)).length
  return hits / terms.length
}

/** Min-max normalize to 0..1; all-equal inputs collapse to 1 (neutral). */
function normalize(value: number, min: number, max: number): number {
  const span = max - min
  return span > 0 ? (value - min) / span : 1
}

export interface RankOptions {
  /** How many chunks to keep after re-ranking. */
  finalK: number
  /** Override temporal detection (defaults to detecting from the query). */
  temporal?: boolean
}

/**
 * Re-rank ANN candidates into the final prompt set. Score is a weighted blend of
 * semantic closeness, recency, and keyword overlap; recency is up-weighted for
 * temporal queries. Ties break toward the newer message so "latest" is stable.
 */
export function rankChunks<T extends RankableChunk>(
  candidates: readonly T[],
  query: string,
  opts: RankOptions,
): T[] {
  if (candidates.length === 0) return []
  const temporal = opts.temporal ?? detectTemporalIntent(query)

  const times = candidates.map((c) => Date.parse(c.date) || 0)
  const minT = Math.min(...times)
  const maxT = Math.max(...times)

  // Weights sum to 1. Temporal queries let recency dominate; otherwise semantics
  // lead with a light recency tie-breaker and a keyword rescue leg.
  const wRec = temporal ? 0.55 : 0.15
  const wKw = 0.2
  const wSem = 1 - wRec - wKw

  const scored = candidates.map((c, i) => {
    // Absolute cosine similarity (pgvector distance ∈ [0,2]) — a stable 0..1 that
    // doesn't exaggerate small gaps the way min-max over a narrow pool would, so
    // the keyword/recency legs can actually move a near-tie.
    const sem = 1 - Math.min(2, Math.max(0, c.distance)) / 2
    const rec = normalize(times[i]!, minT, maxT) // newer → higher (relative to pool)
    const kw = keywordScore(query, c.subject, c.text)
    return { c, score: wSem * sem + wRec * rec + wKw * kw, time: times[i]! }
  })

  scored.sort((a, b) => b.score - a.score || b.time - a.time)
  return scored.slice(0, opts.finalK).map((s) => s.c)
}
