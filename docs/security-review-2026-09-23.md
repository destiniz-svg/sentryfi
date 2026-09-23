# Security review, 23 September 2026

The gate in the plan before real figures from any company other than Altura: prove that one company cannot reach another's data through any route (database, every endpoint, exports, connectors, caches).

**Result: passed, with the fixes below deployed.** The cross-tenant suite (`backend/security/cross-tenant.test.js`, run with `npm run test:security`) boots the real server on a throwaway database. It opens two companies over the API, and from company B it attacks every kind of company A record through every endpoint. All 51 checks pass. Run it again whenever a connector, export or new kind of record is added.

## What was found, and what was done

| # | Severity | Finding | Fixed by |
|---|---|---|---|
| 1 | High | Anyone could register an email address first and be added straight into a company when an administrator later added that address. The answer also revealed whether an address had an account. | People join only by invitation link, unless they already belong to that company. The answer is the same whether or not the address has an account. |
| 2 | Medium | Backups cover every company, but any company's administrator could see them and start one. | Backups are for platform owners only, named in `PLATFORM_ADMIN_EMAILS` (set on Railway to the owner's login). Everyone else gets "not found". |
| 3 | Medium | The app's database role could read every company's name and tax numbers, the password hashes, and any company's journal counter. | Row-level security on `companies` and `journal_counters`. The role can read only a person's id, name and email. |
| 4 | Medium | One route let the request body name the user, which would forge the audit trail. | Who and which company always come from the session. Every request is pinned to its company, so nothing later in it can switch to another. |
| 5 | Medium | Ids sent by the client were not checked against the company. A line could name another company's account, and the error revealed whether an id existed. | Posting refuses any account, project, party, cost code or dimension that is not this company's. Bills check their supplier, project and billed-to company. |
| 6 | Low | A tin's holder did not have to be a member. | Checked. |
| 7 | Low | Documents stayed in a shared phone's browser cache after sign-out. | Sent with `no-store`. |
| 8 | Low | Sessions were not ended by a password change. | Each session carries a version. A password change, or "sign out on every device", ends the others. |
| 9 | Low | Sign-in timing revealed which addresses exist, and failed attempts were limited only per network. | Unknown addresses take as long as wrong passwords. Ten failures per address in fifteen minutes are allowed, then that address waits. |
| 10 | Low | No content security policy. | A report-only policy is live. Enforce it once the browser console has been quiet on the real app for a week. |
| 11 | Low | On a shared phone, the next person could send the last person's queued offline bills as their own. | Queued items carry who took them and send only as that person. They are kept, never deleted, at sign-out. |
| 13 | Info | The Zoho host check would have accepted a look-alike domain. | Hosts are listed by name. |

Also fixed along the way: two date checks on bank rates that never matched, and refused origins now answer 403 instead of a server error.

## Closed since

- **Sign-up email check** (closed the same day). Email goes through Resend (`RESEND_API_KEY` on Railway). A new account can do nothing until it taps the link in its confirm-your-address email. Forgot password emails a one-hour link, and using it also confirms the address, so a real owner takes back an address someone else registered: their password replaces the squatter's and the squatter is signed out. Password changes and new Face ID devices send an alert. Five more checks in the suite (56).

## Still open, on purpose

- **Two-column foreign keys.** Ownership is checked in code (finding 5). A lasting database-level guarantee would add `UNIQUE (company_id, id)` on parent tables and composite foreign keys. It's a large schema change, so do it before a second country pack.
- **The per-address limit is held in memory** in one process. Move it to the database if Sentryfi ever runs on more than one.
- **Enforce the content security policy** (see 10).
- **Rotate the demo password** that has been used for browser checks. It has appeared in working notes.

## How to keep it true

- Run `npm run test:security` in `backend/` before any change that adds a route, an export or a connector, and add an attack to the suite for it.
- Every new table with a `company_id` gets `ENABLE` and `FORCE ROW LEVEL SECURITY` and a `company_isolation` policy, in its schema file.
- The suite checks that every table with a `company_id` has row-level security switched on and forced, with a policy. A new table without its wall fails the suite. As company B, it also looks for A's rows in every one of those tables.
