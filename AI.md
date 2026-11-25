# AI usage

AI was used extensively, from architecture exploration to documentation. The tool was Claude Code
(Claude Opus 5.5), which wrote nearly all of the code, tests and documentation.

I supplied the assessment brief, its acceptance criteria and the working rules, approved the
architecture after the options and trade-offs were presented, review the code, and own the delivered
result. The automated tests, runtime probes and checks against package source or documentation were
mostly run by the AI.

Related: [architecture and trade-offs](docs/DECISIONS.md),
[security findings and verification](docs/SECURITY_REVIEW.md).

## 1. Ownership

| Area                          | Developer                                                           | AI                                       |
| ----------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Requirements                  | Supplied the brief; required decisions before code                  | Mapped requirements to features          |
| Architecture, dependencies    | Approved the recommended set; kept four later changes               | Proposed options; made those changes     |
| Auth, security, API contracts | Approved the token strategy, controls and error format              | Analysed, implemented, ran the reviews   |
| Hardening                     | Required known gaps to be fixed, not only documented; set the order | Designed and implemented the fixes       |
| Testing                       | Approved the plan; required claims here to be verified              | Wrote and ran tests; diagnosed and fixed |
| Code review                   | Reviews the code                                                    | Two AI reviews, fault injection          |
| Release                       | Authorised publication                                              | Compared the result with the brief       |

| Decision                                                    | Origin                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| In-memory access token, rotating httpOnly refresh cookie    | AI proposal, approved                                        |
| 409 for a registered email at sign-up                       | AI proposal, approved                                        |
| scrypt, shared Zod, Vitest                                  | AI changes to the approved plan, kept by me afterwards       |
| Pre-1.0 auth package replaced by `@nestjs/jwt` and own code | Required by me; AI design                                    |
| MongoDB authentication; Swagger off in the compose stack    | Required by me; AI design                                    |
| Grace period, immediate revocation, database timeouts       | AI design, from my request to review refresh-token behaviour |
| `shadcn` CLI and `cn` removed                               | AI choice, from my request to review dependencies            |

## 2. Workflow

1. **Requirements.** The opening prompt attached the PDF and asked for every decision before any
   code. It was the most effective prompt: token storage, enumeration and error format surfaced
   early.
2. **Suggestions, then approval.** Claude returned a decision table with recommendations; I accepted
   the recommended set.
3. **Scaffolding.** `nest new`, `create-vite`, `shadcn init`, then trimmed. For versions newer than
   the model knew, Claude read the installed docs and types.
4. **Implementation and tests.** Core API modules and the later hardening were test-first. The first
   API e2e specs ran after the wiring, and most early web tests followed the code.
5. **Review.** A second Claude agent read the code; later the implementing agent re-reviewed fixes,
   tests and dependencies, including fault injection.

Commits are grouped by topic; their order is logical rather than a timeline. Results: 186 unit and
integration tests and 18 browser runs pass, with coverage in the [README](README.md#testing).

## 3. Corrections

| Issue                                                                              | How it was noticed      | Resolution                                      |
| ---------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| Plan assumed CommonJS, Jest, class-validator; NestJS 12 differs                    | Scaffold output         | Plan revised                                    |
| Scaffolds added hosted telemetry, a deployment CLI and agent files                 | Reading output          | Removed                                         |
| Generated UI depended on the new, unreviewed `cn` package and the whole shadcn CLI | Reading output; audit   | Replaced by `clsx` and `tailwind-merge`         |
| OpenAPI lost email format and password hints                                       | Inspecting JSON Schema  | `.meta()` on schemas; now tested                |
| A wrong-password 401 could trigger a token refresh; tabs could log each other out  | Reasoning               | Credential calls opt out; Web Locks; tests      |
| The per-account limit, itself a review fix, could be bypassed with padded emails   | Runtime probe           | Normalised by the validation schema; test first |
| Tests missed faults: weak, or true for the wrong reason                            | Fault injection         | Tests added; details in the security review     |
| A new test passed for the wrong reason (base64 padding bits)                       | Fault injection         | Test corrected                                  |
| README's local setup failed without a root `.env`                                  | Re-reading              | `scripts/init-env.sh`                           |
| nginx kept the old API address after a container was replaced                      | Testing the stack       | Resolved at request time                        |
| Mobile gap, truncated email, invisible check marks                                 | Screenshots             | CSS fixes; no regression tests                  |
| Scripted edits that silently did not apply; a command chain that skipped lint      | Lint, re-reading output | Redone with strict checks                       |
| A process-kill pattern was too broad                                               | Later audit             | Containers checked; **effect on host unknown**  |

**Rejected by the AI:** `Secure` cookies in the local HTTP stack, with the reason recorded.

## 4. Trade-offs I decided to keep

1. The per-account limit counts successful sign-ins too, and lets anyone lock another person out for
   15 minutes. It slows guessing one account's password from many addresses.
2. The 30-second grace period tolerates lost responses at the cost of later theft detection.
3. The stack listens on 127.0.0.1 only. TLS and a proxy are needed before any shared deployment.
