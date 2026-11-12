# Level 3 assessment mapping

Reviewed against the supplied PES University DBMS Aug-Dec 2026 Level 3 assessment sheet. The maximum is 50 marks. This maps evidence to requirements; it does not predict marks or replace correct execution and the individual viva.

| # | Component | Marks | Project evidence | Readiness |
|---|---|---:|---|---|
| 1 | ER diagram | 2 | `er_diagram_chen.svg` and `er_diagram_chen_details.svg`, with matching editable drawio files | Reviewed; use both sheets |
| 2 | Relational schema, keys, relationships and constraints | 3 | `relational_schema.md`, `.svg` and `.drawio`; nine MySQL tables and a separated vector table | Reviewed against SQL |
| 3 | SQL DDL with constraints | 4 | `database/mysql/01_schema.sql`; PK/FK, uniqueness, checks, indexes and triggers | Fresh imports verified |
| 4 | NoSQL/vector database creation | 4 | `database/pgvector/01_setup.sql`; actual vector extension, metadata and HNSW index | Executed with PostgreSQL/pgvector; Compose still needs deployment check |
| 5 | Technology justification | 1 | Root README, Architecture and Summaries sections; schema document's vector-store explanation | Documented |
| 6 | DML operations | 4 | `database/mysql/03_dml_demo.sql`; captured-ID INSERT/UPDATE/DELETE and SELECT; rollback-only fixtures | Real affected rows verified; repeatable |
| 7 | Nested/correlated/recursive queries and joins | 4 | MySQL `03_dml_demo.sql` and `07_advanced_queries.sql` | Executed on MySQL |
| 8 | Procedure/function, trigger and CTE | 6 | `05_procedures_functions.sql`, `06_triggers.sql`, `07_advanced_queries.sql`; atomic handover and effective employment views | Imports and integrity/rollback tests verified |
| 9 | Vector feature, read/update/delete | 7 | `database/pgvector/02_crud_examples.sql` (SQL), `app/lib/pgvector.js` + `app/pages/api/summaries/[id].js` + profile page (application RUD with re-embedding), `app/pages/api/search/semantic.js`, `app/tests/vector.test.mjs`, `http.integration.mjs`, `browser.spec.js` | SQL demo, API and UI read/update/delete verified on real pgvector 0.8.7; HNSW index used by cosine ordering |
| 10 | Next.js interface | 3 | Login, dashboard, management, tasks, work logs, profile and handover pages | Production build and browser checks |
| 11 | Backend/API and database integration | 2 | `app/pages/api/`, MySQL/pg pools and evidence-aware summary flow | HTTP workflows verified against isolated databases |
| 12 | Frontend/database authentication, minimum two roles, RBAC | 4 | USER_ACCOUNT, NextAuth credentials, bcrypt, admin/employee scope, live account checks in APIs and protected page rendering; MySQL roles and GRANTs in `database/mysql/08_roles.sql`, verified by `database/tests/rbac.cjs` | Login, forbidden access, departure revocation and database-level privilege denials tested |
| 13 | Documentation and Git/GitHub | 2 | README, verification record, source tests, screenshots and `contribution_plan.md` | Documentation present; four user commits published and verified; friend's four commits pending |
| 14 | Originality, individual contribution, modification/viva | 4 | Employee knowledge-retention use case, transaction/vector design, actual contribution history and individual explanations | Each student must review their work, author their own commits and prepare for viva |
| | **Total available** | **50** | | |

## Remaining submission actions

1. Compose startup (MySQL 8.4 and pgvector/pg16) was verified on 2026-11-08; repeat it on the demonstration machine.
2. Be ready to explain that summaries are record-based and embedded with the offline lexical `local-hash-v1` model: similarity reflects shared vocabulary, not neural semantics.
3. Four database/backend commits are published on main under Pradhyut21. The friend reviews and commits the four remaining work groups using their own identity. Equal counts remain pending until both histories exist.
4. Confirm genuine names/contributions and rehearse the schema, normalization, transaction failure case, recursive query, vector read/update/delete and cosine-search explanation.

See `verification.md` for executed checks and limits, and `contribution_plan.md` for the agreed Git split. No friend's author identity or contribution is fabricated by this project preparation.
