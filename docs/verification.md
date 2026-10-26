# Verification record

Date: 26 October 2026 (Asia/Kolkata). These results describe checks actually executed during this continuation of the supplied scaffold.

| Check | Result | What was exercised |
|---|---|---|
| Production build | PASS | Next.js 15.5.28, all pages, API routes and middleware compiled |
| Application/vector tests | PASS — 17 tests | Input validation, role boundaries, provider response/error contracts, bounded evidence and fingerprints, real pgvector cache/search/model isolation and captured-ID CRUD rollback |
| MySQL integration | PASS — 7 groups | Fresh startup imports, genuine seed bcrypt hashes, aggregates, invalid input with no mutation, notice handover, effective departure, injected mid-transfer failure with complete rollback |
| Advanced SQL and repeatable DML | PASS | `07_advanced_queries.sql` executed; DML insert/update/task-update/delete each affected exactly one fixture row and rollback preserved table counts |
| HTTP integration | PASS — 9 workflow groups (10 tests including the parent) | Login, own-only data, forbidden requests, entity CRUD, duplicate-account rollback, work-log invariants, historical retention, manager-cycle rejection, summary caching/staleness, handover and account expiry |
| Browser verification | PASS — 4 tests | Admin workflows, saved summary generation, employee route/API restrictions, 390-pixel mobile layout, active navigation and historical assignee/manager/head retention; no JavaScript page or application console errors |
| Concurrency and live roles | PASS — 3 regression groups (4 tests including parent) | Blocked project move rejects a newly logged task; opposing manager edits remain acyclic; existing cookies respect both role demotion and promotion |
| Dependency audit | PASS — 0 reported vulnerabilities | Resolved lockfile; patched Next.js plus a compatible patched PostCSS override |
| GitHub publication | PASS - 4 commits | origin/main matches 8321db7; GitHub author for all four is Pradhyut21; friend's groups still uncommitted |
| Compose structure | PASS — parsed | Service, initialization mount and healthcheck configuration parsed as YAML |

## Runtime used

- Windows, Node.js 22.18.0.
- An isolated MySQL 8.0.46 instance in this chat's scratch directory, loopback port 33316. No existing user database was opened or changed.
- PGlite PostgreSQL with the actual pgvector extension for SQL tests. The running web app used node-postgres against an ephemeral PGlite socket adapter on loopback port 35433.
- System Chrome through Playwright, with desktop and 390-pixel mobile viewports.
- No provider API key. Provider contract tests simulate responses and failures; the running app generates and caches clearly labelled record-based summaries.

## Observed behavior

The HTTP suite verified that a failed duplicate-account creation leaves no partial employee, daily logged time cannot exceed 24 hours, employees cannot edit another employee's records or change task ownership, and deletes cannot erase retained work history. Resignation transfers open tasks while keeping work-log authors unchanged; self-handover is rejected. A pending notice retains login access through the last working day; a past departure revokes existing sessions as well as new logins.

Summary tests verified source IDs, cache reads, source edits marking the cache stale, regeneration clearing staleness, transferred tasks disappearing from the departing employee's assignment snapshot, and historical contribution logs remaining available. Semantic search without a key returns an explicit setup error. Real vector SQL tests verify cosine ranking, latest-only snapshots and exclusion of incompatible embedding models.

MySQL fault injection caused the task-update step inside the resignation procedure to fail after earlier steps had begun. The test verified that the inserted resignation, employee status and task changes were all rolled back. On restricted database accounts that cannot create the temporary fault trigger, that one optional test is reported as skipped; this execution used the isolated test administrator for that check and had no skips.

## Limits

Docker was unavailable on this machine, so the provided MySQL 8.4/pgvector PostgreSQL 16 Compose services were not launched here. SQL was tested with MySQL 8.0 and an embedded PostgreSQL/pgvector engine; this does not substitute for a deployment-machine Compose check. Live paid-provider generation and semantic relevance were not evaluated. The supplied schema targets a fresh database, not an automatic migration of an existing installation.

Browser screenshots in `docs/screenshots/` show real seeded records and an actual cached record-based summary. They are copied into the release archive from the successful browser capture.

Repeatable commands and fixture behavior are documented in the root README and `database/tests/README.md`. HTTP integration fixtures intentionally retain their historical records; run those tests against a disposable database.

## Follow-up rubric audit

The Chen model is now supplied as main and details sheets, with matching editable files, and the physical schema includes current keys, constraints and separate vector metadata. Vector and MySQL demonstrations use generated fixture IDs and real affected rows, then roll back. Long deterministic summaries disclose compact listings; provider evidence includes total/included counts and prioritizes open/high-priority work. Embedding input is never silently shortened.

Historical reference editors preserve the current resigned assignee/manager/head while rejecting newly selected ineligible people. Protected page rendering and API authorization both re-read current role and employment. Task project edits and manager hierarchy changes hold appropriate transaction locks. The new concurrency test observes a genuinely blocked update before inserting a log, and verifies the resulting409 preserves the original project.

Changed muted text colors were checked computationally at >=4.73:1, and active navigation exposes aria-current. This was scoped visual/accessibility polish, not a claim of full WCAG conformance.
