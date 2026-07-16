/**
 * Shared HTTP plumbing for the provider adapters.
 *
 * Adapters call REST APIs with the global `fetch` — no provider SDKs (those live
 * in api/worker). Tests inject a fake `fetch` via the adapter constructor, so
 * every network call routes through the `FetchImpl` handed to the adapter.
 */

/** The subset of the global `fetch` signature the adapters rely on. */
export type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Thrown when a provider returns a non-2xx response. */
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`Provider request failed (${status}) for ${url}: ${body.slice(0, 500)}`)
    this.name = 'ProviderHttpError'
  }
}

/** Issue an authenticated request and parse JSON, throwing on non-2xx. */
export async function authedJson<T>(
  fetchImpl: FetchImpl,
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetchImpl(url, { ...init, headers })
  if (!res.ok) {
    throw new ProviderHttpError(res.status, url, await safeText(res))
  }
  // Some endpoints (Gmail stop, Graph subscription delete) return 204 no-content.
  if (res.status === 204) return undefined as T
  const text = await safeText(res)
  return (text ? JSON.parse(text) : undefined) as T
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
