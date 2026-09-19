# Security notes

Findings from the review of the purchased backend, and what was done about each.
Recorded 19 September 2026 so nothing here is silently forgotten.

## Fixed before first deploy

- **CORS reflected any origin while sending cookies.** `origin: true` with
  `credentials: true`, production `sameSite: "none"`, and no CSRF token in the
  codebase meant any site a logged-in user visited could read their clients,
  invoices, expenses and payments, and delete invoices. The allow-list was
  already parsed in `config/env.js` and never used. Now pinned to it, and the
  cookie is `sameSite: "lax"`, which is correct because the API serves the web
  app from the same origin.
- **Database TLS was unauthenticated.** `rejectUnauthorized: false` was
  hardcoded, so the connection was encrypted but a man in the middle could
  present any certificate. Now verified unless `DATABASE_SSL_NO_VERIFY=1` is
  set deliberately.
- **Cross-tenant client leak.** `invoices.client_id` was never checked for
  ownership, so an invoice could point at another user's client and the read
  join returned that client's name, email, company and address. The join is
  now scoped to the same owner.

## Known, not yet fixed

- **No roles or permissions of any kind.** Every authenticated user has total
  power over their own data and there is no concept of a site supervisor who
  may log petty cash but not touch a tax return. Sentryfi needs six roles. This
  is a from-scratch build, tracked in PRODUCT.md.
- **Changing a password does not invalidate existing sessions.** A stolen
  cookie keeps working for the rest of its seven days. Needs a
  `password_changed_at` column checked in `requireAuth`.
- **Logout does not revoke the token**, it only clears the cookie.
- **No password reset flow.** A user who forgets their password is locked out
  permanently.
- **Registration is an account oracle**, returning a distinct 409 for an
  address already registered.
- **Rate limiting covers only auth and AI.** Reports runs six aggregate
  queries with no cap. There is no global limiter.
- **Upload type checking trusts the client's declared Content-Type** with no
  magic-byte check. Blast radius is small because nothing is written to disk,
  but it is a free pipe to a paid API.
- **`express.json({ limit: "12mb" })` applies to every route**, not just
  uploads.
- **Money is stored and computed as floating point.** For an accounting
  product this is the most expensive thing on the list. See
  `docs/data-model.md` for the integer-laari model that replaces it.
- **No transactions.** Multi-statement writes are not atomic.
