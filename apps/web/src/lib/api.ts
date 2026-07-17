/**
 * Typed API client for the Revido Mail backend.
 *
 * Two exports, both talking to the same origin (or `VITE_API_URL` when the API
 * is hosted separately) with the session cookie attached:
 *
 *   - `apiClient` — the Hono `hc<AppType>` RPC client. It is the long-term home
 *     for every call, but `AppType`'s routers are still empty (api-service merges
 *     them in a later wave), so today it only types the auth/health surface. The
 *     React Query hooks therefore go through `api`/`apiFetch` for now and tighten
 *     to `apiClient.<route>` once those routes land.
 *   - `api` / `apiFetch` — a small typed `fetch` wrapper. The caller names the
 *     response type; it attaches `credentials: 'include'`, JSON headers, and turns
 *     any non-2xx response into a thrown `ApiError` so React Query treats it as an
 *     error.
 */
import { hc } from 'hono/client'
import type { AppType } from '@revido/api/rpc'

/** Base origin for the API. Empty string == same-origin (the default deploy). */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? ''

/**
 * End-to-end typed RPC client. Every request carries the session cookie.
 * Exported for the auth/session surface today; the data hooks migrate onto it
 * once api-service registers its routers into `AppType`.
 */
export const apiClient = hc<AppType>(import.meta.env.VITE_API_URL ?? '/', {
  init: { credentials: 'include' },
})

/** Error thrown by `apiFetch` for any non-2xx response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** `RequestInit` as accepted by `apiFetch` (it manages `credentials`/headers). */
export type ApiFetchInit = RequestInit

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Typed `fetch` against the API. `path` is an absolute route path
 * (e.g. `/threads/abc`); the caller supplies the expected response type.
 */
export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const isForm = init?.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      // Let the browser set the multipart boundary for FormData bodies.
      ...(init?.body != null && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = await parseBody(res)
  if (!res.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request to ${path} failed (${res.status})`
    throw new ApiError(res.status, message, body)
  }
  return body as T
}

/** FormData passes through untouched; anything else is JSON-encoded. */
function withBody(data: unknown): ApiFetchInit {
  if (data === undefined) return {}
  if (data instanceof FormData) return { body: data }
  return { body: JSON.stringify(data) }
}

/** Verb-shaped convenience wrappers around `apiFetch`. */
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'POST', ...withBody(data) }),
  put: <T>(path: string, data?: unknown) => apiFetch<T>(path, { method: 'PUT', ...withBody(data) }),
  patch: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', ...withBody(data) }),
  del: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'DELETE', ...withBody(data) }),
}
