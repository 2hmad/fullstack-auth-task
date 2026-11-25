# Architecture decisions

Decisions were taken **before** writing code, then revised once where the tooling turned out to be
newer than planned (marked _Revised_). Each entry: what we chose, why, and what we gave up.

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
  Presenting an already-used token means it was stolen: the whole token family is revoked
  (OAuth 2.0 Security BCP §4.14.2). Logout revokes the family.
- On page reload the web app calls `POST /auth/refresh` once to restore the session.
- **Rejected:** token in `localStorage` (any XSS steals it); one long-lived JWT in a cookie (no
  revocation, no rotation).

## 5. `@nestjs/authentication` instead of hand-rolled JWT + Passport — _Revised_

Planned: `@nestjs/jwt` + argon2 + a custom guard. Nest 12 ships a first-party auth package that
already provides, tested: a global guard with `@Public()`, `@CurrentUser()`, timing-safe password
verification (`PasswordHasher`, scrypt), and `TokenService` with rotating refresh tokens and reuse
detection.

- **Why:** less custom security code = fewer places to get crypto wrong. Our own code is limited
  to the MongoDB refresh-token store, which we verify against the package's official
  `authenticationStoreContract()` suite (including the concurrency cases).
- **Risk:** the package is 0.x. We pin the exact version (`0.1.7`) and the contract suite catches
  behaviour changes on upgrade.
- **scrypt instead of argon2:** OWASP-approved, built into Node (no native addon to compile in
  Docker/CI), and it is what the package's timing-safe verify uses.

## 6. Secure-by-default routes

The guard protects every route; public ones opt out with `@Public()` (`signup`, `signin`,
`refresh`, `logout`, `health`). A forgotten decorator fails closed (401), never open.
Protected endpoint: `GET /api/v1/users/me`.

## 7. Security hardening

- `helmet` security headers; CORS limited to the configured web origin.
- `app.enableCsrfProtection()` (Nest 12, Fetch-Metadata based) on top of `SameSite=Strict`.
- Rate limiting with `@nestjs/throttler`: 100 req/min globally, 5 req/min per IP on sign-up/sign-in.
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

## 9. API shape

- Versioned prefix `/api/v1`; health probes at `/health` (liveness) and `/ready` (MongoDB ping).
- Successful responses return the resource itself. **Every error** has one shape:
  `{ statusCode, error, message, path, timestamp, requestId }`, produced by a global exception
  filter. Unexpected errors are logged with their stack and answered with a generic 500.
- OpenAPI (Swagger UI) at `/api/docs`, generated from the same Zod schemas.

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
- **UI:** Tailwind CSS + shadcn/ui (Radix primitives: accessible by default), light/dark.
- **Same origin:** Vite proxies `/api` in development, nginx in production. This is what makes
  `SameSite=Strict` cookies work and removes CORS from the browser path.

## 12. Testing strategy

| Layer        | Tool                                                    | Covers                                                   |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| Shared rules | Vitest                                                  | every field rule and edge case                           |
| API unit     | Vitest + `@nestjs/testing`                              | services, repository mapping, error filter               |
| API store    | `authenticationStoreContract()` + mongodb-memory-server | refresh-token store contract, concurrency                |
| API e2e      | Supertest + mongodb-memory-server                       | every route, status codes, cookies, rotation, reuse      |
| Web unit     | Vitest + Testing Library                                | forms, validation messages, route guards                 |
| Full flow    | Playwright                                              | sign up → app → logout → sign in, against the real stack |

## 13. Delivery

- GitHub Actions: lint, type-check, test and build every package; then Playwright against the
  built stack.
- `docker compose up` runs MongoDB, the API and nginx serving the web app.
- Conventional commits, small and in order, so the history shows how the work progressed.
