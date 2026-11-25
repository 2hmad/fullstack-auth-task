# Security review

What was found, what was done about it, and how that was checked. The reasoning behind the designs
is in [DECISIONS.md](DECISIONS.md).

**Who reviewed.** First, a second Claude agent without the implementation conversation read the
code (it was briefed by the implementing agent and ran nothing). Later, the implementing agent
reviewed the fixes, the tests and the dependencies, with probes against running systems. The
developer reviews the code as well; the findings below come from the AI reviews. None of this is an
independent audit or a penetration test.

## Findings

Severities of 1–9 are the first reviewer's; 10–13 were found in the later review.

| #   | Finding                                                   | Severity | Status                                                                         | Verified by                                                    |
| --- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | No CSP or frame protection on HTML and assets             | High     | Fixed: one nginx include in every location                                     | Stack check                                                    |
| 2   | MongoDB on all interfaces, without authentication         | High     | Fixed: authentication, least-privilege API user, internal network, no port     | Stack check                                                    |
| 3   | Any refresh error cleared the cookie                      | Medium   | Fixed: only a 401 does                                                         | Tests; live, database stopped and paused                       |
| 4   | A failed logout looked successful                         | Medium   | Fixed: error shown, session kept                                               | Test                                                           |
| 5   | Swagger on in production                                  | Medium   | Fixed: off in production, including the compose stack                          | Test; stack check                                              |
| 6   | A late refresh restored a token after logout              | Low      | Fixed: generation counter                                                      | Test                                                           |
| 7   | No per-account limit on password guessing                 | Low      | Fixed: 10 per 15 min per email; **lockout trade-off remains**                  | Tests                                                          |
| 8   | Sign-in redirect could drop the return path               | Low      | Fixed: done by the route guard, same-site paths only                           | Tests, with a second protected page                            |
| 9   | Refresh cookie not `Secure` in compose; no HSTS           | Low      | **Partly:** HSTS added, port bound to 127.0.0.1; the local stack is still HTTP | Stack check for HSTS; tests for the flag in production         |
| 10  | A lost refresh response ended the session                 | Medium   | Fixed within a 30 s grace period in one process                                | Tests; browser test; live                                      |
| 11  | Access token valid up to 15 min after logout or theft     | Medium   | Fixed: session checked on every request                                        | Tests; browser test; live                                      |
| 12  | Requests hung while MongoDB accepted but did not answer   | Low      | Fixed: 5 s socket timeout, 10 s in total                                       | Live, database paused: 500 in 10 s, then the same cookie works |
| 13  | Padded emails bypassed the per-account limit (a fix of 7) | Medium   | Fixed: same schema as validation                                               | Test                                                           |

nginx also kept proxying to the old address after the API container was replaced (502); found while
testing the stack, fixed, and confirmed with a container that had changed address. No automated test.

## How it was verified

- **Stack check.** [`scripts/verify-stack.sh`](../scripts/verify-stack.sh) probes the compose stack
  from outside: anonymous reads and writes and wrong passwords are denied, the API user cannot reach
  other databases or create users, MongoDB's port is closed, Swagger answers 404, cross-site POSTs
  get 403, and the headers are on HTML and scripts. CI runs it. As a control it was run against the
  stack before these fixes, with one header include removed: 9 checks failed.
- **Fault injection.** Faults were put into security-relevant code in a throwaway copy, one at a
  time, and the tests run. On the first version, 45 faults: a first run left 7 undetected (deleted
  user, token audience, CORS, general rate limit, `Secure` flag, password hash selection, logged
  headers), tests were added, and 44 are now caught; the last is hidden by the log redaction behind
  it. On the in-house auth code that replaced the 0.x package, 31 faults: 29 caught after one test
  was added (a hash comparison weakened to a prefix). The other 2 remove checks that a later step
  repeats (the atomic mark-used; the expiry cap), so behaviour does not change.
- **Live probes** of the Docker stack: database stopped and paused during refresh, client giving up
  mid-refresh, 60 parallel requests while paused, retries, reuse, reuse after the grace period, 8
  concurrent refreshes (one token issued), logout. No password, token or database credential in the
  resulting API logs.
- **Earlier, on the replaced hasher (same scrypt cost), not repeated:** equal sign-in timing for known and unknown emails (293 ms median each,
  9 samples, local).

## Dependencies

- `pnpm audit` reports no known vulnerabilities, development dependencies included. CI fails on
  moderate and above.
- `pnpm audit signatures`: 681 packages, all with verified registry signatures.
- Install scripts are opt-in; one package is allowed (`mongodb-memory-server`, tests only).
- Production licences are permissive (MIT, Apache-2.0, BSD, ISC, 0BSD, PSF-2.0, and OFL for the font).
- Removed: the `shadcn` CLI (one unused stylesheet; brought in a package with a known
  vulnerability), `cn` (recent and unreviewed, replaced by `clsx` and `tailwind-merge`),
  `source-map-support` and `vite` from the API. About 165 fewer installed packages.
- **Authentication** uses `@nestjs/jwt` 12 (stable, first-party; it wraps `jsonwebtoken` 9) and
  Node's `crypto`. An earlier version relied on the pre-1.0 `@nestjs/authentication`; it was
  replaced by the code described in [DECISIONS.md §5](DECISIONS.md#5-nestjsjwt-and-small-in-house-auth-code--revised-twice).
- Other dependencies were checked through metadata only; their source was not read.

## Accepted and open

1. **Account lockout.** Anyone can use up another person's sign-in budget for 15 minutes, and
   successful sign-ins count towards it.
2. **Sign-up reveals registered emails** (409), by design, rate-limited.
3. **Grace period.** A stolen refresh token replayed within 30 s is answered, if the owner has not
   used the new one yet; the theft is then detected at the next use. Set the period to 0 for strict
   single use.
4. **Per-process state.** Rate limits and the grace period are not shared between API instances.
   An ambiguous database write (a failure between the server applying the rotation and confirming
   it) can still end a session.
5. **No TLS in the stack.** See Deployment in the [README](../README.md#deployment).
6. **Where Web Locks is missing**, tabs that refresh together rely on the grace period alone.
