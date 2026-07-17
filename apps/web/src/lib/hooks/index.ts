/**
 * The React Query hook layer — one hook per row of `docs/api-contract.md`.
 *
 * Reads are `useQuery`, writes are `useMutation` with cache invalidation of the
 * keys they touch (keys live in `@/lib/query-keys`). Everything talks to the API
 * through the `api` helper in `@/lib/api`; the calls tighten onto the typed
 * `hc<AppType>` client once api-service registers its routers. Screens still read
 * from `@revido/mock-data` today — a later wave swaps them onto these hooks.
 */
export * from './threads'
export * from './categories'
export * from './messages'
export * from './ai'
export * from './agents'
export * from './approvals'
export * from './reminders'
export * from './commitments'
export * from './accounts'
export * from './signatures'
export * from './settings'
export * from './onboarding'
export * from './leads'
export * from './user'
export * from './auth'
