# AI usage

I led this project as its engineer and used AI as the tool. I set the requirements and the quality
bar, weighed the options and chose the architecture, directed the work from the first plan to the
public deployment, review the code, and own the result.

Claude Code (Claude Opus 5.5) was used extensively: it laid out options and their trade-offs, and
wrote nearly all of the code, tests and documentation within the decisions below. The work ran the
way a team's should: agreed design first, directed rounds, and evidence before anything counted as
done.

Related: [architecture and trade-offs](docs/DECISIONS.md),
[security findings and verification](docs/SECURITY_REVIEW.md).

## 1. How I led the work

- **Design before code.** My first instruction was that every decision is made before any code is
  written. Token storage, account enumeration, the error format and the test strategy were settled
  at that point, when changing them cost nothing.
- **Trade-offs on the table.** Each major choice came with its alternatives and costs. I chose with
  those in view, and the costs are written down in DECISIONS rather than hidden.
- **Fix it, don't word it.** When the review listed known gaps, I required the project itself to be
  fixed instead of the gaps being described better, and set the order: database authentication,
  closed API docs, refresh tokens, dependencies, CI, tests and security findings.
- **Stability over novelty.** I did not accept a pre-1.0 package in the authentication code, although
  it was working and tested.
- **Evidence over claims.** Statements in these documents had to be checked against the repository,
  including the uncomfortable ones.
- **Clear ownership of documents.** I gave each document one purpose, so a reader knows where to look.

## 2. Decisions I made

The AI proposed options and detailed designs; the choice was mine. Two entries, the shared schemas
and scrypt, replaced the first plan during the build, and I kept them.

| Decision                                                             | Why                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Access token in memory, rotating refresh token in an httpOnly cookie | Nothing for XSS to steal from storage; sessions can be revoked             |
| 409 for a registered email at sign-up                                | Clear for users; the disclosure is accepted and rate-limited               |
| One set of Zod schemas for the form and the API                      | The two sides cannot drift apart                                           |
| scrypt from Node's `crypto`                                          | OWASP-approved, with no native dependency                                  |
| `@nestjs/jwt` and small own code instead of a pre-1.0 package        | Stable base under the most sensitive code, for about 300 lines to own      |
| MongoDB authentication and a least-privilege user in the stack       | Network isolation alone is not access control                              |
| API docs off in production                                           | They map the attack surface                                                |
| Immediate revocation and a 30-second grace period                    | Logout means logout; a lost response is not treated as a theft             |
| Fewer dependencies, audited in CI                                    | About 165 fewer packages to trust                                          |
| Public demo on Vercel and MongoDB Atlas                              | A reviewer can try it; it also led to rate limits shared between instances |

Trade-offs I decided to keep:

1. The per-account limit counts successful sign-ins too, and lets anyone lock another person out for
   15 minutes. It slows guessing one account's password from many addresses.
2. The 30-second grace period tolerates lost responses at the cost of later theft detection.
3. The compose stack is plain HTTP and listens on 127.0.0.1 only. It needs TLS and a proxy before it
   is shared. The Vercel demo has TLS.

## 3. Workflow

| Step           | Me                                                                 | AI                                                       |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Requirements   | Supplied the brief, the acceptance criteria and the working rules  | Mapped requirements to features                          |
| Architecture   | Weighed the options and chose                                      | Prepared options with trade-offs                         |
| Implementation | Set the direction and priorities                                   | Wrote the code; read installed docs for new versions     |
| Testing        | Approved the strategy; required verified results                   | Wrote and ran tests, probes and fault injection          |
| Review         | Review the code; decided which findings to fix and which to accept | Two AI reviews, one by an agent outside the conversation |
| Documentation  | Defined each document's purpose; corrected its content             | Wrote the text                                           |
| Release        | Authorised publication; chose the hosting; set up Atlas            | Configured, deployed and probed                          |

Core API modules and the later hardening were test-first. The first API e2e specs ran after the
wiring, and most early web tests followed the code. Commits are grouped by topic; their order is
logical rather than a timeline. Results: 198 unit and integration tests and 18 browser runs pass,
with coverage in the [README](README.md#testing).

## 4. Corrections

AI output was a starting point, not a source of truth. What was wrong, and how it was caught:

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
| Vercel build ran locally but failed on Vercel (ES modules)                         | Live probe              | API deployed from its Dockerfile                |
| A process-kill pattern was too broad                                               | Later audit             | Containers checked; **effect on host unknown**  |
