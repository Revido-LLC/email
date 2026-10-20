# Staging background processing

Staging and recognized `*-pr-N` Railway environments default to background-disabled. Production and local processing are unchanged. The worker imports no consumers, opens no database/provider connections, and starts neither polling nor scheduled mail/AI work. Its status server returns liveness200 at `/health` or `/live`, readiness503 at `/ready`, and404 for unknown paths. Queues and mailbox data are retained.

Job-producing API operations return503 before accepting background work. Compose/reply, forwarding approvals, recording submissions/reprocessing, reminder chasers and explicit mailbox linking are guarded before business changes. Provider webhooks are authenticated normally and reject enqueue503 while disabled so retries remain possible. Existing-mailbox sign-in remains available; primary sign-in's best-effort linking does not break authentication.

## Coordinated staging test session

Append `--staging-background` to the existing worker and API start commands in staging only. No new secrets or environment variables are required. Enable worker first and verify its normal startup, then enable API. Existing legacy polling, schedules and provider actions can run while opted in; use test accounts and expect runtime charges.

To finish, disable API submissions first by removing the argument, allow active/delayed test jobs to finish or agree to retain them, then remove the argument from the worker. Never clear queues as cost cleanup. Verify worker readiness503 and natural sleep; storage remains billable. This is explicit test opt-in, not automatic job-triggered waking. Production is not part of this workflow.

## Idle database connections

Staging and recognized PR environments close unused PostgreSQL pool connections
after 30 seconds. This also applies during an opted-in staging test. Active queries
and transactions finish normally; the next query opens a connection again. The
same environment identity policy controls workers and pools. Production, local
development and unknown custom environments keep their existing pool settings.
