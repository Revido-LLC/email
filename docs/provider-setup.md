# External provider setup — what's left

The providers still needing setup, with the exact env-var names the code reads and the console steps
for each. For the full runtime topology see [`deploy.md`](./deploy.md); `.env.example` is the
authoritative name list.

**Already done — skip these:** Railway (hosting + Postgres, provisioned + migrated), Infisical (secret
injection), OpenRouter (LLM — key incoming), Resend (outbound email).

**Two rules before you start:**

- Every value below goes into **Infisical** (`staging`, then `prod`) — never committed to the repo.
- All OAuth callback URLs derive from **`BETTER_AUTH_URL`** (your API's public base URL, e.g.
  `https://api.revido.co`). Set that first, then register the derived URLs in each console.

---

## 1. Google Cloud — Gmail (login + sync + push)

1. **Create a Google Cloud project.**
2. **Enable APIs:** _Gmail API_ and _Cloud Pub/Sub API_.
3. **OAuth consent screen** — External. Add scopes: `openid`, `email`, `profile`, and the **restricted**
   `https://www.googleapis.com/auth/gmail.modify`. Add yourself + testers as **test users** (staging runs
   in test mode, ≤100 users).
4. **Create an OAuth 2.0 Client** (type: _Web application_) →

   | Env var                | Value             |
   | ---------------------- | ----------------- |
   | `GOOGLE_CLIENT_ID`     | the client id     |
   | `GOOGLE_CLIENT_SECRET` | the client secret |

   **Authorized redirect URIs — register both:**

   - `${BETTER_AUTH_URL}/api/auth/callback/google` — sign-in (Better Auth)
   - `${BETTER_AUTH_URL}/auth/oauth/gmail/callback` — mailbox connect

5. **Pub/Sub push** (real-time new-mail):
   - Create a topic → `GMAIL_PUBSUB_TOPIC` = full name `projects/<project>/topics/<topic>`.
   - Grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on that topic.
   - Create a **push subscription** delivering to `https://<your-api>/webhooks/gmail`, authenticated with a
     service account (OIDC token):
     - `GMAIL_PUSH_AUDIENCE` = that webhook URL (the OIDC `aud`)
     - `GMAIL_PUSH_SA_EMAIL` = the push subscription's service-account email
   - Both are **required in production** — the webhook returns 500 if they're unset.
   - (No separate GCP service-account key is needed; the worker calls `users.watch` with the user's own
     OAuth token.)

> 🕒 **Long-lead:** `gmail.modify` is a restricted scope. Opening it to the **public** needs a **Google
> CASA Tier 2** security assessment + OAuth app verification. File early — it runs in parallel with
> everything else. Test mode is fine for staging/demo.

---

## 2. Microsoft Entra (Azure AD) — Outlook (login + sync + push)

1. **Register an app** in Microsoft Entra ID. Account type is your call (`MS_TENANT_ID` defaults to
   `common` = multi-tenant).
2. **API permissions** (Microsoft Graph, _delegated_): `Mail.ReadWrite`, `Mail.Send`, `offline_access`,
   `openid`, `email`, `profile`.
3. **Client secret + IDs:**

   | Env var                                              | Value                                    |
   | ---------------------------------------------------- | ---------------------------------------- |
   | `MS_CLIENT_ID` **and** `MICROSOFT_CLIENT_ID`         | the app (client) id — set **both** to it |
   | `MS_CLIENT_SECRET` **and** `MICROSOFT_CLIENT_SECRET` | the client secret — set **both** to it   |
   | `MS_TENANT_ID`                                       | your tenant id, or `common`              |

   > The API's login path reads `MS_*`; the worker's Graph sync reads `MICROSOFT_*`. Point both families
   > at the **same** app registration.

   **Redirect URIs** (platform: Web) — register **both**:

   - `${BETTER_AUTH_URL}/api/auth/callback/microsoft` — sign-in
   - `${BETTER_AUTH_URL}/auth/oauth/outlook/callback` — mailbox connect

4. **Graph change notifications** (push): the worker subscribes, posting to
   `GRAPH_NOTIFICATION_URL` = `https://<your-api>/webhooks/graph`. Set `GRAPH_CLIENT_STATE` to a secret you
   choose — it's echoed back on each notification for verification (**required in production**).

> 🕒 **Long-lead:** **Microsoft publisher verification** removes the unverified-app warning and is needed
> to go public.

---

## 3. Embeddings — Voyage (or OpenAI)

Retrieval/RAG needs an embedding provider (1024-dim, to match the `pgvector` column).

- **Voyage** (preferred — strong multilingual/Dutch): create an account → `VOYAGE_API_KEY`.
- **or OpenAI** (fallback, `text-embedding-3-large`): → `OPENAI_API_KEY`.

Get a **no-retention / no-train** agreement, to match the privacy posture of the LLM path.

---

## 4. Attachment storage — S3 / R2, or a Railway volume?

**You asked: can we just use an attached Railway volume?** Not cleanly, because two services share the
store. Details:

- **≤10 MB attachments are stored inline** (encrypted in Postgres) — reachable by both `api` and `worker`,
  needs **no** object storage. You can launch on this alone: leave every `STORAGE_S3_*` unset. This covers
  the common case.
- **>10 MB attachments go to a `StorageProvider`**, and **both** `apps/api` (upload/download routes) **and**
  `apps/worker` (writes on ingest) read/write it — so the store must be reachable from **both** services.
- A **Railway volume attaches to a single service** and is **not shared between services** (and it pins that
  service to one replica). A volume mounted on `api` is invisible to `worker`. The code's
  `LocalFsStorageProvider` (`STORAGE_LOCAL_DIR`, in `packages/core/src/storage/index.ts`) works today and
  could point at a volume mount — but only if **one** service does all attachment I/O, which isn't how it's
  wired.

**Recommendation:**

- **Launch now on the inline ≤10 MB path** — nothing to set up.
- **For >10 MB**, use **Cloudflare R2** (S3-compatible, no egress fees) or S3 — a shared object store both
  services reach over the network:

  | Env var                        | Notes                            |
  | ------------------------------ | -------------------------------- |
  | `STORAGE_S3_BUCKET`            | selects the S3 provider when set |
  | `STORAGE_S3_REGION`            |                                  |
  | `STORAGE_S3_ENDPOINT`          | R2/S3 endpoint URL               |
  | `STORAGE_S3_ACCESS_KEY_ID`     |                                  |
  | `STORAGE_S3_SECRET_ACCESS_KEY` |                                  |

  ⚠️ **`S3StorageProvider` is currently a loud stub** — it throws until implemented, so setting these vars
  won't work until that code lands (`packages/core/src/storage/index.ts`). It's the intended production
  swap point.

- A **Railway volume is viable only** if you first consolidate attachment I/O into one service (e.g. the
  worker streams large-attachment bytes through the api), accepting no horizontal scaling of that service.

---

## 5. Optional

- **PostHog** (content-free analytics) — `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`. Unset ⇒ a complete no-op.
- **Lead notifications** — `LEAD_NOTIFY_WEBHOOK_URL` (a Slack/webhook URL for new signups).

---

## 6. Generate yourself (not a provider)

- `BETTER_AUTH_SECRET`, `DEV_KMS_MASTER_KEY` —
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` each.
- `BETTER_AUTH_URL`, `WEB_ORIGIN`, `VITE_API_URL` — your deployed URLs.
- Envelope encryption uses the **built-in dev KMS** today (`DEV_KMS_MASTER_KEY`) — no external KMS account
  is wired yet.

---

## Minimum to demo end-to-end with a real Gmail

Google Cloud (test mode) + Voyage (embeddings) — everything else (Railway, Infisical, OpenRouter, Resend)
is already set up. Add **Microsoft Entra** only when you want Outlook. **CASA Tier 2** and **Microsoft
publisher verification** are needed only to open to the _public_ — start them early.
