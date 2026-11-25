# Architecture decisions

The main decisions were settled **before** implementation, from options and trade-offs prepared with
AI (see [AI.md](../AI.md)). Entries marked _Revised_ changed later, mostly because the tooling turned
out to be newer than planned. Each entry: what was chosen, why, and what was given up.

---

## 1. Monorepo with pnpm workspaces

`apps/api` (NestJS), `apps/web` (React), `packages/shared` (validation + API contract types),
`e2e` (Playwright).

- **Why:** one clone, one CI pipeline, one place for the field rules both sides must agree on.
- **Trade-off:** `packages/shared` has to be built before the apps type-check. Root scripts do it.

## 2. One set of validation rules, shared by API and web — _Revised_

`packages/shared` exports Zod schemas (`signUpSchema`, `signInSchema`, `PASSWORD_RULES`). The API
validates bodies with them through Nest 12's `StandardSchemaValidationPipe`. The web app validates
its forms with the same objects through `@hookform/resolvers/zod`.

- **Planned:** class-validator DTOs on the API, Zod on the web, shared only constants.
- **Why we changed:** Nest 12 validates Standard Schema (Zod 4) natively and `@nestjs/swagger`
  renders Zod schemas into OpenAPI. Sharing the schema objects removes the last possibility of
  drift, and also drops `class-validator`/`class-transformer` and their reflection metadata.
- **Rules:** email trimmed + lower-cased (one mailbox = one account), max 254. Name trimmed, 3–50.
  Password 8–128, ≥1 letter, ≥1 number, ≥1 special character (anything not a letter, digit or
  whitespace; Unicode-aware). The 128 cap bounds hashing cost per request. Sign-in does not apply
  strength rules, so changing the rules later never locks existing users out.
- Unknown fields are rejected (`z.strictObject`), so a client cannot smuggle `role: "admin"`.

## 3. NestJS 12 (ESM) + Vitest — _Revised_

The official CLI scaffolds Nest 12: ESM-only, Vitest, oxlint, TypeScript 6. We kept those defaults
instead of fighting the framework back to CommonJS + Jest.

- Removed from the scaffold: `@nestjs/observe` (hosted telemetry SaaS needing an account),
  `@nestjs/mau`, and the bundled agent files. Not needed for this deliverable.

## 4. Authentication: short-lived access token in memory, rotating refresh token in an httpOnly cookie

| Token   | Lifetime | Where it lives                                                          |
| ------- | -------- | ----------------------------------------------------------------------- |
| Access  | 15 min   | JS memory only (never `localStorage`), sent as `Authorization: Bearer`  |
| Refresh | 7 days   | `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/v1/auth` |

- Refresh tokens are **single use** and stored **hashed** (SHA-256). Every refresh rotates.
  Presenting a spent token means it was stolen, and the whole session is revoked (OAuth 2.0
  Security BCP §4.14.2).
- **Grace period for lost responses** (_added later_). If the server rotates but the answer never
  arrives, the browser still holds the spent token, and strict reuse detection would sign out its
  owner. For `REFRESH_TOKEN_REUSE_GRACE_SECONDS` (default 30, at most 60, 0 turns it off) a spent
  token gets the _same_ pair again, only while that pair is unused and the session is alive.
  - Cost: detection of a stolen token replayed inside the window is delayed to its next use, not
    lost, because thief and owner then share one token.
  - The pairs are held in the memory of one process. Another instance or a restart answers
    strictly, which is safe but may end the session. A shared store would mean keeping usable
    tokens at rest, so it was not done.
- **Revocation is immediate** (_added later_). Every token of a session carries a `sid` claim, and
  each request checks that the session was not revoked, so logout and theft detection end access
  tokens too instead of leaving them valid for up to 15 minutes. Cost: one indexed read per
  request, next to the user lookup that was already there.
- A 401 clears the cookie. A 429, a 5xx or no answer says nothing about the session, so the cookie
  and the access token stay, and the web app offers a retry instead of the sign-in form. A failed
  logout keeps the user signed in and says so, because the session is still alive on the server.
- On page reload the web app calls `POST /auth/refresh` once to restore the session.
- **Rejected:** token in `localStorage` (any XSS steals it); one long-lived JWT in a cookie (no
  revocation, no rotation).

## 5. `@nestjs/jwt` and small in-house auth code — _Revised twice_

Planned: `@nestjs/jwt` + argon2 + a custom guard. During the build this became NestJS's pre-1.0
`@nestjs/authentication` package. It was later replaced again, because a 0.x package should not
carry the most security-sensitive part of the app. Now:

- **`@nestjs/jwt` 12** (stable, first-party) signs and verifies access tokens: HS256 only, with
  issuer, audience and expiry enforced on verification, so `alg: none` and key confusion are refused.
- **`AuthGuard`** (global): every route needs a valid token unless marked `@Public()`, so a forgotten
  decorator fails closed. It also loads the user and checks that the session was not revoked.
- **`TokenService`**: rotating single-use refresh tokens with reuse detection (§4), stored as
  SHA-256. The successor is saved before the old token is spent, so a database failure in between
  leaves a retryable token rather than a false theft alarm.
- **`PasswordHasher`**: scrypt from Node's `crypto` (N=2¹⁷, r=8, p=1, OWASP's minimum), constant-time
  comparison, NFKC normalisation, a dummy hash for unknown emails, and upgrade on sign-in when the
  cost changes.
- **Trade-off:** about 300 lines of security code are ours to maintain instead of a library's. They
  are covered by unit tests on real MongoDB, API e2e tests (forged, expired, unsigned and
  wrong-audience tokens among them) and fault injection
  ([SECURITY_REVIEW.md](SECURITY_REVIEW.md#how-it-was-verified)). Passport was not added: one
  bearer-token strategy does not need it.
- **scrypt instead of argon2:** OWASP-approved and built into Node, so there is no native addon to
  compile in Docker or CI.

## 6. Secure-by-default routes

The guard protects every route; public ones opt out with `@Public()` (`signup`, `signin`,
`refresh`, `logout`, `health`). A forgotten decorator fails closed (401), never open.
Protected endpoint: `GET /api/v1/users/me`.

## 7. Security hardening

- `helmet` security headers; CORS limited to the configured web origin.
- `app.enableCsrfProtection()` (Nest 12, Fetch-Metadata based) on top of `SameSite=Strict`.
- Rate limiting with `@nestjs/throttler`, three budgets: 100 req/min globally (per user or IP);
  5 sign-in/sign-up attempts per minute per IP; 10 per 15 minutes per submitted email, which
  slows guessing one account from many IPs. The email is normalised by the same schema that
  validates the request, so padding or letter case cannot dodge the budget. Trade-offs: anyone
  can use up another person's budget for 15 minutes, and successful sign-ins count too.
- **Where the counts live** (_revised for Vercel_). The two budgets against password guessing are in
  MongoDB, so running several instances, or restarting, does not multiply them: one atomic update on
  the database's clock per attempt, keys hashed, a TTL index for cleanup. The general budget stays in
  memory, because it only protects an instance from load and would cost a write per request.
- API responses are `Cache-Control: no-store`: they carry tokens, and Vercel labelled them `public`.
- **No user enumeration on sign-in:** unknown email and wrong password get the same 401 body, and
  `PasswordHasher.verify()` checks a dummy hash when the user does not exist so timing matches.
- **Sign-up with a taken email returns 409.** This does reveal that an address is registered;
  accepted for UX (the user needs to know to sign in instead) and mitigated by rate limiting.
  A product with stricter privacy needs would answer 201 and send an email instead.
- Environment validated with Zod at startup: the app refuses to boot with a missing or too-short
  `JWT_SECRET` (≥32 bytes) or an invalid `MONGODB_URI`.
- The password hash never leaves the repository layer (`select: false` + mapping to a profile).

## 8. MongoDB via Mongoose (`@nestjs/mongoose`)

- Unique index on `email` is the real guard against duplicates (no check-then-insert race); the
  duplicate-key error is mapped to 409.
- Refresh tokens: a TTL index on `familyExpiresAt` keeps the collection bounded automatically.
  "Mark used" is one conditional `updateOne` so two concurrent refreshes cannot both win.
- Socket and queue timeouts (5 s): a database that stops answering fails requests instead of
  hanging them. The driver retries reads once, so the caller waits about 10 s at most.
- The compose stack enables access control. The API signs in as a user with `readWrite` on its own
  database and nothing else; MongoDB is on an internal network with no published port.

## 9. API shape

- Versioned prefix `/api/v1`; health probes at `/health` (liveness) and `/ready` (MongoDB ping).
- Successful responses return the resource itself. **Every error** has one shape:
  `{ statusCode, error, message, path, timestamp, requestId }`, produced by a global exception
  filter. Unexpected errors are logged with their stack and answered with a generic 500.
- OpenAPI (Swagger UI) at `/api/docs`, generated from the same Zod schemas. Off by default when
  `NODE_ENV=production`, which includes the compose stack (it maps the attack surface);
  `docker-compose.dev.yml` turns it on for local use.

## 10. Logging

`nestjs-pino`: JSON logs in production, pretty logs in development, one access-log line per
request, a request id on every line (taken from `X-Request-Id` or generated, echoed back in the
response), and `authorization`, `cookie`, `set-cookie` and `password` redacted.

## 11. Frontend: React 19 + Vite + TypeScript

- **Routing:** React Router — `/signup`, `/signin`, `/app` (protected). Signed-in users are
  redirected away from the auth pages; signed-out users are redirected to `/signin`.
- **Forms:** react-hook-form + the shared Zod schemas; a live password checklist driven by
  `PASSWORD_RULES`; show/hide password; errors linked with `aria-describedby`.
- **Server state:** TanStack Query. A small `fetch` wrapper attaches the access token, and on a 401
  refreshes once (deduplicated across concurrent requests) and retries.
- **UI:** Tailwind CSS + shadcn/ui components (Radix primitives: accessible by default), light/dark.
  The components live in the repository; the shadcn CLI package and its `cn` helper were replaced by
  `clsx` and `tailwind-merge`, which removed about 165 installed packages.
- **Same origin:** Vite proxies `/api` in development, nginx in production. This is what makes
  `SameSite=Strict` cookies work and removes CORS from the browser path.

## 12. Testing strategy

| Layer        | Tool                              | Covers                                                 |
| ------------ | --------------------------------- | ------------------------------------------------------ |
| Shared rules | Vitest                            | every field rule and edge case                         |
| API unit     | Vitest + `@nestjs/testing`        | services, repository mapping, error filter             |
| API auth     | Vitest + mongodb-memory-server    | token rotation, reuse, expiry, store concurrency, hash |
| API e2e      | Supertest + mongodb-memory-server | every route, status codes, cookies, rotation, reuse    |
| Web unit     | Vitest + Testing Library          | forms, validation messages, route guards               |
| Full flow    | Playwright                        | sign up → app → logout → sign in, lost responses, tabs |
| Deployment   | `scripts/verify-*.sh`             | MongoDB access control, closed docs, security headers  |

## 13. Delivery

- GitHub Actions: audit, lint, type-check, test and build every package; Playwright against the
  production builds on an in-memory MongoDB; and Playwright plus `scripts/verify-stack.sh` against
  the compose stack in production mode.
- `docker compose up` runs MongoDB, the API and nginx serving the web app. nginx sends the CSP and
  other security headers from one include file in every location (nginx drops server-level
  `add_header`s in any location that sets its own), and resolves the API's name at request time, so
  replacing the API container does not leave it proxying to the old address.
- The stack is plain HTTP, so its port is bound to 127.0.0.1 and the cookie's `Secure` flag is off
  there. A shared deployment needs a TLS proxy and `COOKIE_SECURE=true`.
- **Vercel** (demo): the web app as static files and the API from its Dockerfile, as two services on
  one domain, which the `SameSite=Strict` cookie needs. Vercel's own NestJS build was tried first. It
  left packages such as mongoose out of the bundle, and once that was worked around its launcher
  could not `require()` NestJS 12's ES modules. The Dockerfile is what CI tests anyway.
  `vercel.json` repeats nginx's security headers; a test fails if the two differ.
  `scripts/verify-deployment.sh` checks the live site; CI does not deploy or run it.
- Conventional commits grouped by topic. The order is logical rather than a timeline: most
  corrections were folded together.
