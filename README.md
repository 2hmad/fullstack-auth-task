# Atrium: sign up / sign in module

A production-minded authentication module: **NestJS 12 + MongoDB** API and a **React 19 +
TypeScript** web app, in one pnpm monorepo.

![Sign-up page](docs/screenshots/sign-up.png)

| Sign up (dark mode)                        | Mobile                                         | Application page                                 |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------ |
| ![Dark](docs/screenshots/sign-up-dark.png) | ![Mobile](docs/screenshots/sign-up-mobile.png) | ![Application](docs/screenshots/application.png) |

- **Architecture and trade-offs:** [docs/DECISIONS.md](docs/DECISIONS.md)
- **Security findings and how they were verified:** [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)
- **How AI was used:** [AI.md](AI.md)

---

## Requirements → where they are met

| Requirement                                                            | Implementation                                                                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React or Vue, TypeScript                                               | React 19, strict TypeScript everywhere                                                                                                                                          |
| Sign-up form: email, name (≥3), password (≥8, letter, number, special) | [`packages/shared/src/auth.schemas.ts`](packages/shared/src/auth.schemas.ts): **one Zod schema** used by the form _and_ the API. A live checklist shows each rule as it is met. |
| Sign-in form: email, password                                          | [`apps/web/src/features/auth/pages/sign-in-page.tsx`](apps/web/src/features/auth/pages/sign-in-page.tsx)                                                                        |
| Application page: "Welcome to the application." + logout               | [`apps/web/src/features/workspace/welcome-page.tsx`](apps/web/src/features/workspace/welcome-page.tsx)                                                                          |
| NestJS + MongoDB                                                       | NestJS 12, Mongoose 9 via `@nestjs/mongoose`                                                                                                                                    |
| Sign-up / sign-in endpoints honouring the field rules                  | `POST /api/v1/auth/signup`, `POST /api/v1/auth/signin`, validated with the shared schemas                                                                                       |
| At least one protected endpoint                                        | `GET /api/v1/users/me`. Every route is protected by default; public ones opt out with `@Public()`.                                                                              |
| README                                                                 | This file                                                                                                                                                                       |
| AI.md                                                                  | [AI.md](AI.md)                                                                                                                                                                  |
| _Bonus:_ logging, error handling, tests, CI/CD, API docs               | pino structured logs with request ids; uniform error body; 186 unit/integration tests and 18 browser runs; GitHub Actions; Swagger at `/api/docs` (development)                 |

## Quick start (Docker, ~2 minutes)

Requires Docker, and a POSIX shell with openssl for the first command (Git Bash or WSL on Windows).

```bash
./scripts/init-env.sh          # writes .env with random secrets; keeps an existing one
docker compose up --build
```

App: http://localhost:8080. This is production mode: MongoDB requires authentication and is not
reachable from outside, and Swagger UI is off. To have Swagger UI at
http://localhost:8080/api/docs, add the development overrides:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

MongoDB creates its users only on an empty volume. If one exists from an older version of this
stack, or you change the passwords in `.env`, `docker compose down -v` recreates it (**this deletes
its data**).

nginx serves the web app and proxies `/api` to the API, so the browser only ever talks to one
origin.

## Local development

Requires Node 24 and Docker (for MongoDB).

```bash
corepack enable                      # provides the pinned pnpm version
pnpm install
./scripts/init-env.sh                # writes .env and apps/api/.env with random secrets
pnpm dev:db                          # MongoDB on localhost:27017
pnpm dev                             # API on :3000, web app on :5173 (Vite proxies /api)
```

- App: http://localhost:5173
- Swagger UI: http://localhost:3000/api/docs
- Health: http://localhost:3000/health (liveness), http://localhost:3000/ready (MongoDB check)

### Scripts (from the repository root)

| Command          | What it does                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`       | Builds the shared package, then runs API and web app in watch mode                                                                              |
| `pnpm dev:db`    | MongoDB in Docker, with authentication, on 127.0.0.1:27017                                                                                      |
| `pnpm test`      | Unit + integration tests of every package (API tests use in-memory MongoDB)                                                                     |
| `pnpm test:cov`  | Same, with coverage reports and an 80% threshold                                                                                                |
| `pnpm test:e2e`  | Playwright against the production builds and an in-memory MongoDB (needs `pnpm build`; run `pnpm --filter @auth-app/e2e install-browsers` once) |
| `pnpm lint`      | oxlint (type-aware on the API)                                                                                                                  |
| `pnpm typecheck` | TypeScript, every package                                                                                                                       |
| `pnpm build`     | Production builds                                                                                                                               |
| `pnpm format`    | Prettier                                                                                                                                        |

To run the browser tests against the Docker stack instead:
`AUTH_THROTTLE_LIMIT=1000 docker compose up -d --build --wait` then
`E2E_BASE_URL=http://localhost:8080 pnpm test:e2e`. `./scripts/verify-stack.sh` checks that stack's
access control, closed API docs and security headers. The default limit of 5 sign-in attempts per
minute per IP would otherwise (correctly) block the test run.

## Repository layout

```
apps/
  api/                 NestJS API
    src/auth/          sign up/in, refresh, logout, JWT provider, MongoDB refresh-token store
    src/users/         user schema, repository, GET /users/me
    src/common/        global exception filter, request ids
    src/config/        environment schema (validated at startup)
    src/health/  src/logging/  src/rate-limit/  src/docs/
    test/              e2e tests (Supertest + in-memory MongoDB)
  web/                 React app
    src/features/auth/ pages, form components, session provider, route guards
    src/lib/api/       fetch wrapper: token in memory, refresh-and-retry, typed errors
    nginx.conf         production web server + same-origin API proxy
packages/shared/       Zod schemas for requests and responses, shared by API and web
e2e/                   Playwright tests of the whole stack
docker/  scripts/      MongoDB user setup, secret generation, stack verification
docs/                  DECISIONS.md, SECURITY_REVIEW.md, screenshots
```

## API

Base path `/api/v1`. Full, interactive reference in Swagger UI (development).

| Method | Path                            | Auth           | Success                                             | Errors             |
| ------ | ------------------------------- | -------------- | --------------------------------------------------- | ------------------ |
| POST   | `/auth/signup`                  | public         | `201` `{ accessToken, expiresIn, user }` + cookie   | 400, 409, 429      |
| POST   | `/auth/signin`                  | public         | `200` `{ accessToken, expiresIn, user }` + cookie   | 400, 401, 429      |
| POST   | `/auth/refresh`                 | refresh cookie | `200` `{ accessToken, expiresIn }` + rotated cookie | 401                |
| POST   | `/auth/logout`                  | refresh cookie | `204`, cookie cleared, session revoked              | —                  |
| GET    | `/users/me`                     | `Bearer` token | `200` `{ id, email, name, createdAt }`              | 401                |
| GET    | `/health`, `/ready` (no prefix) | public         | liveness / readiness                                | 503 when not ready |

Every error has the same body:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["password: Password must contain at least one number"],
  "path": "/api/v1/auth/signup",
  "timestamp": "2026-11-25T12:00:00.000Z",
  "requestId": "6f1c…"
}
```

## How the session works

```
 sign in ──► API ──► { accessToken (15 min) }  + Set-Cookie: refresh_token (7 days, httpOnly,
                                                  SameSite=Strict, Path=/api/v1/auth)
 requests ──► Authorization: Bearer <accessToken>        (token kept in memory only)
 401 ──► POST /auth/refresh (cookie) ──► new access token + rotated cookie ──► retry once
 reload ──► POST /auth/refresh ──► GET /users/me         (session restored, nothing in localStorage)
 lost answer ──► same cookie within 30 s ──► same tokens  (a retry is not a theft)
 reused refresh token ──► whole session revoked           (token theft detection)
 logout ──► refresh and access tokens of the session stop working at once
```

More detail and the alternatives considered: [docs/DECISIONS.md §4–7](docs/DECISIONS.md).

## Testing

| Suite                                | Tests | Notes                                                                                            |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------ |
| `packages/shared`                    | 34    | every field rule and edge case                                                                   |
| `apps/api` unit + integration        | 69    | auth services, password hashing, logging, repository and token store on real (in-memory) MongoDB |
| `apps/api` e2e                       | 42    | every route through the real app: cookies, rotation, reuse, CSRF, 429s                           |
| `apps/web`                           | 41    | forms, guards, session restore, outages, refresh-and-retry (MSW fake API)                        |
| `e2e` (Playwright, desktop + mobile) | 18    | 9 scenarios: real browser → nginx/Vite → API → MongoDB                                           |

Line coverage: API 99%, web 98%, shared 100%. Branch coverage: API 91%, web 93%.

The refresh-token store and token rotation are tested on real (in-memory) MongoDB, including
concurrent refreshes of one token, where exactly one may win.

## Configuration

All API settings are environment variables, validated at startup by
[`apps/api/src/config/env.schema.ts`](apps/api/src/config/env.schema.ts). See
[`apps/api/.env.example`](apps/api/.env.example) for the full list with defaults. Only
`MONGODB_URI` and `JWT_SECRET` are required.

## Deployment

The compose stack is a production-mode build for one machine. Before exposing it:

1. Put a TLS proxy in front (the stack listens on 127.0.0.1:8080, plain HTTP).
2. Set `COOKIE_SECURE=true` and `WEB_ORIGIN=https://your-host` in `.env`.
3. Set `TRUST_PROXY_HOPS` in `docker-compose.yml` to the number of proxies, nginx included, or rate
   limits see the wrong address.
4. Keep one API instance, or move rate limits to a shared store: counts are per process, and so is
   the grace period for lost refresh responses (which fails safe, see DECISIONS §4).

## What I would add next

- Email verification and password reset (the auth package supports both; they need an email
  provider).
- Redis-backed rate limiting once the API runs on more than one instance.
- Route-level code splitting (the JS bundle is ~166 kB gzipped, mostly React and Zod).
