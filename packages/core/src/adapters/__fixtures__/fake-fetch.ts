/**
 * Test-only fetch stub. Routes requests by URL substring to a fixture payload
 * and records every call so tests can assert on request bodies. This is how the
 * adapters are exercised end-to-end without real Gmail/Graph credentials.
 */

import type { FetchImpl } from '../http'

export interface Route {
  /** Match against the request URL (and optionally method). */
  when: (url: string, init?: RequestInit) => boolean
  /** JSON body to return. */
  json?: unknown
  /** HTTP status; defaults to 200. */
  status?: number
}

export interface RecordedCall {
  url: string
  method: string
  body: string | undefined
}

export function makeFakeFetch(routes: Route[]): {
  fetchImpl: FetchImpl
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetchImpl: FetchImpl = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? init.body : undefined
    calls.push({ url, method, body })
    const route = routes.find((r) => r.when(url, init))
    if (!route) throw new Error(`fake-fetch: no route for ${method} ${url}`)
    const status = route.status ?? 200
    const payload = route.json === undefined ? '' : JSON.stringify(route.json)
    return new Response(payload, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { fetchImpl, calls }
}
