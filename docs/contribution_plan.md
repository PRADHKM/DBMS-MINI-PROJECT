# Agreed contribution and commit plan

The user approved four meaningful database/backend commits under the configured identity **Pradhyut21** (`pradhyut2007@gmail.com`), followed by four work groups for the friend to review, own and commit using their actual Git identity. The target is an equal commit count; commit count by itself is not evidence of equal workload or understanding.

## User: four database/backend commits

| Order | Commit topic | Files |
|---|---|---|
| 1 | Define relational schema and seeded local database setup | `.gitignore`, `compose.yaml`, MySQL schema and seed |
| 2 | Add SQL workflows, integrity rules and query demonstrations | Remaining MySQL views/procedures/triggers/DML/advanced query files |
| 3 | Implement credential authentication and role-scoped CRUD APIs | Application package/lockfile/config/env example, middleware, MySQL/auth/validation/catalog helpers and operational API routes |
| 4 | Add pgvector summaries and semantic search | Vector schema/demo, AI/vector/work-context helpers and summary/search routes |

## Friend: four work groups to commit personally

| Order | Commit topic | Files |
|---|---|---|
| 1 | Build the workspace shell, sign-in and overview | `app/components/`, `app/styles/`, `_app.js`, `index.js`, `login.js`, `dashboard.js` |
| 2 | Add management, work tracking, profiles and handover screens | `manage.js`, `tasks.js`, `worklogs.js`, `handover.js`, `employees/[id].js` |
| 3 | Add repeatable application, SQL and browser verification | `app/tests/`, `app/scripts/`, `app/playwright.config.js`, `database/tests/` |
| 4 | Document the design, setup, assessment evidence and actual contributions | Root README and `docs/`, including editable diagrams and reviewed screenshots |

Only the user's four groups are committed by this assistant. The friend's files remain uncommitted in the prepared checkout and are also supplied separately for handoff. The friend should inspect/run/change these files as appropriate, then stage one group at a time, commit with their own name/email and push normally. No backdating, impersonation or empty balancing commits are needed.

The database/backend-only history is intentionally incomplete as a runnable web application until the friend commits the remaining files. The complete source ZIP remains available for review and local execution meanwhile. Do not upload a ZIP as a substitute for source commits.

## Before the final submission

- Both students fill in their actual names, responsibilities and relevant commit links.
- Compare authors with `git shortlog -sne HEAD` and inspect `git log --format=fuller`.
- Ensure exactly four agreed commits from each student if that remains the team's plan; avoid squash merging if preserving those counts matters.
- Review `rubric_mapping.md` and `verification.md`, run the checks on the demonstration machine and prepare for individual explanation/modification in the viva.

Publication status is reported in the chat and the handoff notes. This plan does not assert that pending commits have already been made.

## Verified publication

The following four commits are now on `main`, and GitHub attributes each to Pradhyut21:

- [63af8a2](https://github.com/PRADHKM/DBMS-MINI-PROJECT/commit/63af8a202a8ae1548d47ca6642b6052ce6aba50d) - Define relational schema and seeded local database setup
- [61f5ef0](https://github.com/PRADHKM/DBMS-MINI-PROJECT/commit/61f5ef042995f71ee5aff611fbd625df8a3b91af) - Add SQL workflows, integrity rules and query demonstrations
- [b222644](https://github.com/PRADHKM/DBMS-MINI-PROJECT/commit/b222644947a8aac47eda78759285e98e34149e13) - Implement credential authentication and role-scoped CRUD APIs
- [8321db7](https://github.com/PRADHKM/DBMS-MINI-PROJECT/commit/8321db7d93c701a6151bdd90c3bd40ef5292d16e) - Add pgvector summaries and semantic search

The friend's four commit groups remain uncommitted; an equal author count is still pending their work.
