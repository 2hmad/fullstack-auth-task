# AI usage

AI was used extensively, as an engineering accelerator for architecture exploration, scaffolding,
implementation, testing, security review and documentation. The tool was Claude Code (Claude Opus
5.5), which wrote nearly all of the code, tests and documentation.

I supplied the assessment brief, its acceptance criteria and the working rules. After the options
and trade-offs were presented, I approved the architecture, later chose to keep four changes made
during the build, and I own the delivered result.

AI output was a starting point, checked mainly through automated tests, runtime probes and package
documentation, most of it run by the AI. No line-by-line human review was recorded, so none is
claimed. Known gaps are listed alongside fixes.

## 1. Human engineering ownership

| Area                              | Developer                                                  | AI                                       |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Requirements                      | Supplied the brief; required decisions before code         | Mapped requirements to features          |
| Architecture, dependencies        | Approved the recommended set; kept four later changes      | Proposed options; made those changes     |
| Auth, security, API contracts     | Approved the token strategy, controls and error format     | Analysed, implemented, ran the review    |
| Testing and failure investigation | Approved the plan; required claims here to be verified     | Wrote and ran tests; diagnosed and fixed |
| Final review and release          | Required a check against the brief; authorised publication | Compared, reported gaps                  |

Main decisions (full reasoning in [docs/DECISIONS.md](docs/DECISIONS.md)):

| Problem              | Alternatives                      | Choice and reason                                                                      | Limitation                                               | Origin                |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| Session storage      | `localStorage`; one JWT cookie    | In-memory access token, rotating httpOnly refresh cookie: less XSS exposure, revocable | Access token outlives logout by up to 15 min; races (§3) | AI proposal, approved |
| Auth implementation  | `@nestjs/jwt` with a custom guard | `@nestjs/authentication` 0.1.7: first-party rotation and reuse detection               | Pre-1.0 (pinned); custom MongoDB store                   | AI change, kept       |
| Password hashing     | argon2 (first plan), bcrypt       | scrypt: used by that package, no native addon                                          | Departs from the approved argon2                         | AI change, kept       |
| Validation           | class-validator, shared constants | One set of Zod schemas for API, forms and OpenAPI                                      | Shared package must be built first                       | AI change, kept       |
| Test runner          | Jest (first plan)                 | Vitest: NestJS 12 scaffold default                                                     | None significant found                                   | AI change, kept       |
| Sign-up, taken email | Generic success plus an email     | 409: no email service, and the user needs to know                                      | Reveals registered addresses                             | AI proposal, approved |

## 2. AI workflow

1. **Requirements.** The opening prompt attached the PDF and asked for every decision before any
   code. It was the most effective prompt: token storage, enumeration and error format surfaced early.
2. **Suggestions, then approval.** Claude returned a decision table with recommendations and open
   questions. I accepted the recommended set.
3. **Scaffolding.** `nest new`, `create-vite`, `shadcn init`, then trimmed. For versions newer than
   the model knew, Claude read the installed docs and types.
4. **Implementation and tests.** Core API modules were test-first (rules, config, repository, token
   store, auth service). API e2e specs were first run after the wiring; most web tests followed the
   code.
5. **Visual inspection.** Claude inspected several Playwright screenshots (desktop, mobile, dark).
6. **Security review.** A second Claude agent without the implementation conversation read the code.
   It was briefed by the implementing agent, ran nothing, and did not re-review the fixes, so it is
   not an independent audit.

Commits were grouped by topic, with later corrections folded in; their order is logical rather than
a timeline.

**Automated verification of the code described here:** 127 unit and integration tests (shared 34,
API 60, web 33) and 14 browser runs (7 scenarios, 2 viewports) pass, as does GitHub Actions. Line
coverage is API 99%, web 98% (excluding generated UI components and the entry point), shared 100%;
branch coverage is API 81%, web 91%. Of 12 faults injected into security-relevant code in a
throwaway copy, the tests first caught 11 and, after a missing test was added (§3), all 12.

## 3. Corrections and rework

| Issue                                                                            | Detection               | Resolution                            | Verification                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Ecosystem:** plan assumed CommonJS, Jest, class-validator; NestJS 12 differs   | Scaffold output         | Plan revised (§1)                     | Test suite, build                                                                                           |
| MSW 3 and TypeScript 7 renamed or removed options                                | Type checker            | Config updated                        | Type check, tests                                                                                           |
| **Scaffolding:** hosted telemetry, deployment CLI and agent files added          | Reading output          | Removed                               | Inspection                                                                                                  |
| UI code imports an npm package named `cn`; possible typosquat                    | Reading output          | Kept: shadcn is the listed maintainer | Metadata only; source not audited                                                                           |
| **API docs:** email format and password hints lost                               | Inspecting JSON Schema  | `.meta()` on schemas                  | Seen in live OpenAPI; no automated test                                                                     |
| **Frontend auth:** wrong-password 401 could trigger a refresh                    | Reasoning               | Credential calls opt out              | Tests for the wrapper and for each call; the per-call tests were added after fault injection showed the gap |
| Two tabs refreshing together lose the session                                    | Reasoning               | Web Locks across tabs                 | Browser test, fails without the lock; unprotected where Web Locks is missing                                |
| **Visual:** mobile gap, truncated email, invisible check marks and password dots | Screenshots             | CSS fixes                             | Re-checked visually; no regression tests                                                                    |
| **Tests:** API coverage read 59%, e2e not counted                                | Coverage report         | One combined report                   | Current report                                                                                              |
| Browser runs on Docker hit 429                                                   | API logs                | Limit overridable, default kept       | 14 runs pass on Docker                                                                                      |
| **AI mistakes:** wrong expected rule count; rejected test hasher cost            | Failing tests           | Tests corrected                       | Tests pass                                                                                                  |
| A scripted edit did not apply; a broken command chain skipped lint and format    | Lint, re-reading output | Redone with strict exit codes         | Fresh clone, CI                                                                                             |
| A process-kill pattern was too broad                                             | Later audit             | Containers checked                    | **Effect on host processes unknown**                                                                        |

## 4. Security review

Severities are the reviewer's. "Reproduced" means observed on a running system before the fix.

| Finding (severity)                                    | Impact                              | Reproduced    | Resolution                                                   | Evidence now                                                            | Remaining                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------- | ------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No CSP or frame protection on HTML and assets (High)  | Weaker XSS and clickjacking defence | Yes           | nginx include in each location                               | Headers seen on `/`, `/signin`, assets                                  | No automated test                                                                                                                                                  |
| MongoDB on all interfaces, no authentication (High)   | Data access from the network        | No            | **Partly:** port bound to `127.0.0.1`                        | Binding confirmed                                                       | **Authentication still off:** unauthenticated write succeeded from the host                                                                                        |
| Any refresh error cleared the cookie (Medium)         | Outage ends sessions                | By test       | Cleared on 401 only                                          | Test; with MongoDB stopped, 500, then the same cookie works             | **A lost response can end the session:** with MongoDB paused there was no reply in 30 s, then 401 after recovery. From the code, the UI shows sign-in until reload |
| Failed logout looked successful (Medium)              | Session survives on a shared device | No            | Error shown, session kept                                    | Test                                                                    | Access token valid up to 15 min after logout (confirmed)                                                                                                           |
| Swagger on in production (Medium)                     | API surface exposed                 | No            | Off by default in production                                 | Test                                                                    | **On in the Compose stack**, which runs in production mode                                                                                                         |
| Late refresh restores a token after logout (Low)      | Token in memory after sign-out      | No            | Generation counter                                           | Test                                                                    | None known                                                                                                                                                         |
| No per-account limit (Low)                            | Distributed password guessing       | No            | 10 per 15 min per email, normalised by the validation schema | Tests for plain and padded emails; live, blocked after 10               | Allows locking someone else out for 15 min                                                                                                                         |
| Sign-in redirect could drop the return path (Low)     | Wrong landing page                  | No            | Moved to the route guard, same-site paths only               | Path filter tested                                                      | Race fix not verified: `/app` is the only protected page                                                                                                           |
| Refresh cookie not `Secure` in Compose; no HSTS (Low) | Cookie sent over HTTP               | Configuration | HSTS added; cookie **left as is** for HTTP localhost         | Production default tested; `HttpOnly`, `SameSite=Strict` confirmed live | Compose must not be deployed as is; TLS is not included                                                                                                            |

The first version of the per-account limit, itself a review fix, could be bypassed: it checked the
email length before trimming, so an email padded with 300 spaces skipped it (25 of 25 attempts
passed). A runtime probe found this; the fix started from a failing test. The limits live in process
memory, and successful sign-ins count towards them.

Also checked at runtime: equal sign-in timing for known and unknown emails (293 ms median each, 9
samples, local); cross-site POST rejected (403); password and tokens absent from the logs of a
sign-up, profile and refresh sequence. None of this amounts to a penetration test.

## 5. Engineering decisions and AI trade-offs

- **Accepted as proposed:** monorepo, token strategy, errors-only envelope, secure-by-default
  routes, React stack, Docker, CI. I did not override any recommendation at that stage.
- **Revised by AI during the build, accepted afterwards:** the four "AI change" rows in §1. They
  share one cause, NestJS 12, and were made before I was asked.
- **Rejected (by the AI):** generated telemetry, the deployment CLI and agent files; and, from the
  review, the `Secure` cookie change for Compose, with the reason recorded in the file.

Still needing human evaluation:

1. Whether successful sign-ins should count towards the per-account limit, which also lets anyone
   lock another person out for 15 minutes.
2. Depending on a 0.x authentication package.
3. Tolerance for a lost refresh response: a short reuse grace period trades some theft detection.
4. MongoDB authentication, TLS and Swagger exposure before any shared deployment.
5. Dependencies were not individually audited. pnpm install scripts are opt-in.
