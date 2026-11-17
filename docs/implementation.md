# Implementation reference

A complete walk through everything implemented in the Workload Management System: what each part is, where it lives, how it works and why it was built that way. Read it top to bottom for the whole picture, or jump to a section.

Companion documents: `README.md` (setup and usage), `docs/demo.md` (presentation talk track), `docs/relational_schema.md` (table-by-table schema), `docs/verification.md` and `docs/project_report.md` (test records and audit), `docs/rubric_mapping.md` (marking-scheme mapping).

## Contents

1. [The problem and the idea](#1-the-problem-and-the-idea)
2. [Architecture](#2-architecture)
3. [Repository map](#3-repository-map)
4. [MySQL database](#4-mysql-database)
5. [PostgreSQL + pgvector database](#5-postgresql--pgvector-database)
6. [Backend: shared libraries](#6-backend-shared-libraries)
7. [Authentication and authorization](#7-authentication-and-authorization)
8. [API reference](#8-api-reference)
9. [Summaries, embeddings and similarity search](#9-summaries-embeddings-and-similarity-search)
10. [Resignation and handover](#10-resignation-and-handover)
11. [Frontend pages](#11-frontend-pages)
12. [Concurrency and data-integrity decisions](#12-concurrency-and-data-integrity-decisions)
13. [Infrastructure: Docker Compose and configuration](#13-infrastructure-docker-compose-and-configuration)
14. [Demo data and demo tooling](#14-demo-data-and-demo-tooling)
15. [Tests](#15-tests)
16. [Documentation and diagrams](#16-documentation-and-diagrams)
17. [Change history in this repository](#17-change-history-in-this-repository)
18. [Known limits and stale spots](#18-known-limits-and-stale-spots)

---

## 1. The problem and the idea

When someone leaves a company, what they knew leaves with them. This system keeps a permanent, factual record of each employee's work (tasks, projects, daily work logs with notes) and makes it useful at the moment someone resigns:

- Open tasks move to a named successor in one atomic database operation.
- Completed work and every work log stay credited to the original author.
- A summary of each person's contribution is stored in a vector database, so anyone can later ask "who worked on the Kubernetes rollout?" and get the right person even if they have left.

Two kinds of users exist: **admin** (manages people, projects, tasks and handovers; can search and edit summaries) and **employee** (sees and records only their own work).

## 2. Architecture

```text
Browser
   │   pages (React, Next.js pages router)
   ▼
Next.js server  ── middleware.js: block anonymous page access
   │            ── pages/api/*: role-checked JSON API
   │            ── lib/: validation, auth, DB pools, summary + embedding logic
   ├──────────────► MySQL 8.4         operational data, accounts, rules, roles
   └──────────────► PostgreSQL 16     summary snapshots + 1536-d embeddings
                    + pgvector 0.8
```

- **Next.js 15 (pages router), React 18** for UI and API in one process.
- **NextAuth 4** credentials provider with **bcryptjs** hashes and JWT sessions.
- **mysql2** connection pool (10 connections) and **pg** pool (10 connections).
- No external AI service. Summaries and embeddings are produced inside the app.
- The two databases are linked only by `emp_id`. A cross-database foreign key is impossible, so integrity is checked in application code (for example, vector search drops rows whose employee no longer exists).

## 3. Repository map

| Path | What it holds |
|---|---|
| `compose.yaml` | MySQL and pgvector containers, ports, health checks, init-script mounts |
| `database/mysql/01_schema.sql` … `09_demo_extra.sql` | Schema, seed, demos, views, routines, triggers, advanced queries, roles, optional sample data |
| `database/pgvector/` | Vector schema (`01_setup.sql`) and a rollback-only CRUD demonstration (`02_crud_examples.sql`) |
| `database/tests/` | MySQL fixture tests and database-role tests, plus their README |
| `app/lib/` | `mysql.js`, `pgvector.js`, `ai.mjs`, `auth.js`, `api.js`, `domain.mjs`, `catalog.js`, `work-context.js` |
| `app/pages/` | UI pages and `pages/api/` route handlers |
| `app/components/` | `ui.js` (layout and shared widgets), `server.js` (server-side page guard) |
| `app/middleware.js` | Edge guard for protected URLs |
| `app/tests/` | Unit, integration, concurrency and browser tests |
| `scripts/` | Demo driver (`demo.sh`) and its Node helpers |
| `docs/` | Design diagrams, schema reference, reports, demo guide, this file |

## 4. MySQL database

Database `workload_management_system`, character set `utf8mb4`, server time zone set to `+05:30` by Compose. Created fresh on first container start; the files are bootstrap scripts, not migrations.

### 4.1 Tables (`01_schema.sql`)

| Table | Purpose | Notable rules |
|---|---|---|
| `DEPARTMENT` | Organisational unit | Unique name. `head_emp_id` is added by `ALTER TABLE` after `EMPLOYEE` exists (circular dependency), `ON DELETE SET NULL` |
| `EMPLOYEE` | Person | Unique email, `status` enum (`active`, `resigned`), self-referencing `manager_id`, `date_of_joining` required |
| `USER_ACCOUNT` | Login | One per employee (`emp_id` unique), unique username, bcrypt `password_hash`, `role` enum (`admin`, `employee`). Cascades when the employee is removed |
| `SKILL` | Skill catalogue | Unique name |
| `EMPLOYEE_SKILL` | Many-to-many link | Composite primary key, `proficiency` enum (beginner to expert) |
| `PROJECT` | Unit of work | Status enum, `CHECK` end date not before start date, optional owning department |
| `TASK` | Assignable work item | Priority and status enums, `CHECK` due date not before start date, `assigned_to` is `ON DELETE SET NULL`, project link cascades |
| `WORK_LOG` | Daily record of work | `CHECK (hours_spent > 0 AND hours_spent <= 24)`, author and task foreign keys |
| `RESIGNATION` | Departure record | One per employee (`emp_id` unique), `CHECK` last day not before notice date, optional successor |

Foreign-key actions are chosen deliberately: parents that are only reference data use `SET NULL`; dependants that cannot exist without the parent use `CASCADE`. Deleting people, tasks or projects that carry history is blocked in the application layer (section 12).

### 4.2 Indexes

Secondary indexes beyond the automatic key indexes: `idx_worklog_emp_date`, `idx_task_project`, `idx_task_assigned`, `idx_task_status`, `idx_user_emp`, `idx_employee_status`. Two `FULLTEXT` indexes (`idx_worklog_notes_ft` on work-log notes, `idx_task_desc_ft` on task title and description) support the full-text query demo.

### 4.3 Seed data (`02_seed.sql`)

3 departments, 12 employees (with managers and department heads), 11 user accounts (admins: Ravi Shankar and Harish Kumar; the rest employees; Suresh Pillai has none) with genuine bcrypt hashes of the demo password, 10 skills with proficiency rows, 4 projects, 12 tasks and 25 work logs. It includes the story that drives the demo: employee 5, Suresh Pillai (DevOps), resigned abruptly after leading the Kubernetes migration, handing over to employee 11 (Vikram Reddy).

### 4.4 Views (`04_views.sql`)

| View | What it shows | Why it exists |
|---|---|---|
| `v_employee_effective_status` | Resignation dates, login eligibility (`effective_status`), and employment status (`active`, `notice_period`, or `resigned`) | Computes status when queried using MySQL's current date |
| `v_employee_skills` | Each employee's recorded skills and proficiency levels | Supplies the skill lists for handover review and history |
| `v_active_employee_workload` | Per active employee: open task count and total hours | Aggregates tasks and logs in separate sub-queries so hours are not multiplied by the number of tasks |
| `v_project_progress` | Per project: total and completed tasks, percent complete | Dashboard-style roll-up with `NULLIF` guarding division by zero |
| `v_resignation_handover` | Each resignation's status and dates, both employees' departments, roles and skills, open task count and total hours contributed | Supplies the handover history and terminal report |

### 4.5 Function and procedures (`05_procedures_functions.sql`)

- **`fn_employee_total_hours(emp, from, to)`** returns total logged hours, with optional date bounds.
- **`sp_get_employee_worklog_summary(emp)`** returns three result sets: the employee, their full work history joined to tasks and projects, and their lifetime total.
- **`sp_process_resignation(emp, notice_date, last_day, notes, successor)`** is the transactional core of the handover (section 10). It owns its own transaction, validates everything, locks rows, writes the resignation, updates status and moves open tasks, and rolls back on any error.

### 4.6 Triggers (`06_triggers.sql`)

Six triggers enforce rules even for direct SQL that bypasses the app:

| Trigger | Rule enforced |
|---|---|
| `trg_resignation_before_insert` | Employee exists and is active; dates are sensible and after joining; no self-handover; a successor is required if unfinished tasks exist; successor is active with no notice of their own |
| `trg_resignation_after_insert` | Sets the employee's stored status from the last working day and moves unfinished tasks to the successor, so a raw `INSERT` behaves like the procedure |
| `trg_task_before_insert` | Assignee must be active with no resignation; `completion_date` is set automatically for completed tasks and cleared otherwise |
| `trg_task_before_update_complete` | Same assignee check when reassigning or reopening; keeps `completion_date` consistent |
| `trg_worklog_before_insert` | Task must be unfinished; author must be the current assignee; date must be after joining, not in the future and not after the last working day |
| `trg_worklog_before_update` | Moving a log to another task or author re-runs those checks; editing notes or hours on historical logs stays allowed |

### 4.7 SQL demonstrations

- **`03_dml_demo.sql`** runs inside a transaction and rolls back: `INSERT`, `UPDATE`, `DELETE`, joins, `GROUP BY`, `HAVING`, aggregates and subqueries, using generated IDs and printing real affected-row counts. Safe to run repeatedly.
- **`07_advanced_queries.sql`** covers a correlated subquery (employees above their department's average hours), a nested non-correlated subquery, a correlated subquery in the select list, two recursive CTEs (management chain upward, org chart downward), a plain CTE, and a `MATCH ... AGAINST` full-text search.

### 4.8 Database-level roles (`08_roles.sql`)

Two MySQL roles mirror the app roles, so the database itself refuses out-of-policy statements:

- **`wms_admin_role`**: `SELECT, INSERT, UPDATE, DELETE, EXECUTE` on the whole schema. No DDL, no `GRANT`, no user management.
- **`wms_employee_role`**: read access to operational tables and non-credential views; full access to `WORK_LOG`; `UPDATE` limited by column grants to `TASK.status`, `TASK.completion_date` and `EMPLOYEE.phone`; execute on the hours function and the work-log summary procedure. No access to `USER_ACCOUNT` (password hashes) or `RESIGNATION`, and it cannot run the handover procedure.
- Demo accounts `wms_admin_db` and `wms_employee_db` hold the roles by default.

The web app itself connects as the single `wms_app` account and enforces per-employee row scope in code, because MySQL cannot filter rows per user without per-user views.

## 5. PostgreSQL + pgvector database

Database `workload_management_vectors`, image `pgvector/pgvector:pg16`, extension `vector`.

### 5.1 Table `ai_work_summaries` (`database/pgvector/01_setup.sql`)

| Column | Meaning |
|---|---|
| `summary_id` | Serial primary key |
| `emp_id` | Logical reference to MySQL `EMPLOYEE.emp_id` (no foreign key possible) |
| `generated_on` | Timestamp, default `NOW()` |
| `summary_text` | The summary |
| `source_context` | Free-text note on how it was produced |
| `generation_method` | `record` (built from records) or `edited` (admin changed the text) |
| `source_fingerprint` | SHA-256 of the work records used, for stale detection |
| `embedding_model` | Name of the embedding model, `local-hash-v1` |
| `source_log_ids`, `source_task_ids` | JSON arrays of the exact records the summary covers |
| `embedding` | `VECTOR(1536)` |

Indexes: an **HNSW** index on the embedding with `vector_cosine_ops` (works on an empty table, unlike IVFFlat which needs training data), plus `idx_ai_summaries_emp` and `idx_ai_summaries_latest (emp_id, generated_on DESC, summary_id DESC)` for "latest snapshot per employee".

### 5.2 Rollback-only CRUD demo (`02_crud_examples.sql`)

Plain SQL showing create, read, update and delete plus cosine similarity, using synthetic unit vectors and negative employee IDs, ending in `ROLLBACK`.

## 6. Backend: shared libraries

All under `app/lib/`.

| File | Responsibility |
|---|---|
| `mysql.js` | Creates the MySQL pool from environment variables only (no hard-coded credentials); `query()` helper using prepared statements; `dateStrings` and `decimalNumbers` for predictable JSON |
| `pgvector.js` | PostgreSQL pool and all vector-table operations (below) |
| `ai.mjs` | Record summary builder, task-evidence selection, source fingerprint, offline embedding, vector validation |
| `domain.mjs` | Pure validation helpers with no database access, so they are unit-testable |
| `api.js` | `apiHandler` wrapper, record helpers and history-safe delete |
| `auth.js` | Session and role guards for API routes |
| `catalog.js` | Shared CRUD handlers for departments and projects |
| `work-context.js` | Loads an employee's tasks and work log and computes the fingerprint |

### 6.1 Validation helpers (`domain.mjs`)

`parseId` (positive safe integers only, rejects arrays, fractions and injection strings), `optionalId`, `text` (trimmed, length-bounded, rejects non-strings), `date` (strict `YYYY-MM-DD`, rejects impossible dates such as 31 February), `enumValue` (allow-list), `numberValue` (finite and in range), `assertFields` (request-body allow-list, so extra fields such as `role` cannot be smuggled in), `dateOrder`, `canAccessEmployee`, and the enum lists for task status, project status and priority.

### 6.2 `apiHandler` (`api.js`)

Wraps every route: sets `Cache-Control: no-store`, enforces the allowed HTTP methods (405 with `Allow` header), and translates errors into safe responses without leaking internals:

| Error | Response |
|---|---|
| `HttpError` thrown by validation | its status and message |
| Duplicate key | 409 "already exists" |
| Foreign key violation | 409 "conflicts with a related record" |
| Deadlock or lock timeout | 409 "another change is in progress" |
| Trigger or procedure `SIGNAL 45000` | 400 with the database's message |
| Check, truncation or length error | 400 "values violate database rules" |
| Anything else | 503 generic message; details only in server logs |

Helpers: `requireRecord` (404 if missing), `requireAvailableEmployee` (must be active with no resignation), `insertRecord`, `updateRecord`, and `deleteWithoutHistory`, which locks the parent row, counts dependent history and refuses with 409 instead of silently cascading.

### 6.3 Vector operations (`pgvector.js`)

- `insertSummary`, `listSummaries` (newest first, vectors never returned), `getSummary`, `updateSummary` (text and embedding replaced in one statement, method set to `edited`), `deleteSummary`.
- `searchSimilarSummaries(embedding, limit)`: picks each employee's **latest** snapshot with `DISTINCT ON (emp_id)`, filters to the current embedding model, orders by cosine distance `<=>` and reports `similarity = 1 - distance`.
- Every function takes an optional pool argument so tests can run it against an in-memory PostgreSQL.

## 7. Authentication and authorization

### 7.1 Login (`pages/api/auth/[...nextauth].js`)

Credentials sign-in. The `authorize` function rejects non-string input, usernames over 50 characters and passwords over 72 bytes (bcrypt's limit), then loads the account **only if** the employee is active and any last working day has not passed. The password is checked with `bcrypt.compare`. The JWT carries `empId` and `role`; there is no database session table.

### 7.2 Three layers of access control

1. **Edge middleware (`middleware.js`)**: no token means a redirect to `/login`, for `/dashboard`, `/employees`, `/tasks`, `/worklogs`, `/manage`, `/handover`, `/admin`.
2. **Page guard (`components/server.js`, `requirePage`)**: on every page load it re-reads the account from the database, so a promoted, demoted or departed user is handled immediately even with an old cookie. Admin-only pages redirect others to the dashboard.
3. **API guards (`lib/auth.js`)**: `requireSession` re-reads the account on every call (401 if inactive); `requireRole` adds the role check (403). Row scope for employees (own profile, own tasks, own logs) is enforced inside each route.

### 7.3 Who can do what

| Capability | Admin | Employee |
|---|---|---|
| View employee directory, any profile | yes | own profile only |
| Create/edit/delete employees, departments, projects | yes | no |
| Create tasks, reassign, edit all fields | yes | no |
| Change task status | yes | own tasks only |
| Record, edit, delete work logs | any employee | own logs only |
| Edit phone number | any | own only |
| Record a resignation / handover | yes | no |
| Semantic search | yes | no |
| Generate summary | any employee | own only |
| Read snapshot history | any | own only |
| Edit/delete a snapshot | yes | no |

## 8. API reference

All routes return JSON, require a session unless noted, and use the allow-lists and guards above.

| Route | Methods | Notes |
|---|---|---|
| `/api/auth/*` | NextAuth | Login, session, CSRF |
| `/api/options` | GET | Dropdown data. Admin sees all active, unresigned employees, projects and tasks; employees see only their own scope |
| `/api/employees` | GET, POST | GET filters by `dept`, `status`, `search` (name). Employees get only themselves. POST (admin) creates the employee and, if a username and password are given, the login in **one transaction**; password 8 to 72 bytes, hashed with bcrypt cost 12 |
| `/api/employees/:id` | GET, PUT, DELETE | GET returns employee, tasks and work log. PUT: admin edits profile fields, employee edits phone only; manager changes are cycle-checked; joining date cannot move after existing history. DELETE (admin) is blocked when history exists and for self |
| `/api/departments`, `/api/departments/:id` | GET, POST / GET, PUT, DELETE | Via `catalog.js`. Employees see only their department. Delete blocked while employees or projects reference it |
| `/api/projects`, `/api/projects/:id` | same | Employees see only projects they have tasks in. Delete blocked while tasks exist |
| `/api/tasks`, `/api/tasks/:id` | GET, POST / GET, PUT, DELETE | POST admin-only. Employees can only `PUT {status}` on their own tasks. A task with work logs cannot change project or be deleted |
| `/api/worklogs`, `/api/worklogs/:id` | GET, POST / GET, PUT, DELETE | See rules in section 12. A saved log cannot change task or author |
| `/api/resignations` | GET, POST | Admin only. POST calls `sp_process_resignation` |
| `/api/employees/:id/summary` | GET, POST | GET latest snapshot with a `stale` flag; POST generates a new one |
| `/api/employees/:id/summaries` | GET | Snapshot history, newest first |
| `/api/summaries/:id` | GET, PUT, DELETE | Read (owner or admin; others get 404 so IDs do not leak), update text and re-embed (admin), delete (admin) |
| `/api/search/semantic` | POST | Admin. Body `{question}`, up to 1000 characters; returns the top 5 |

## 9. Summaries, embeddings and similarity search

### 9.1 Building a summary (`ai.mjs`, `work-context.js`)

1. `loadWorkContext(empId)` reads the employee (through the effective-status view), all assigned tasks and all authored work logs from MySQL, and computes a **SHA-256 fingerprint** of that bundle.
2. `recordSummary` writes a deterministic text from the records: counts and total hours, the projects worked on, completed tasks, open tasks needing continuity (highest priority first) and the most recent three logged contributions. Long lists are capped at 10 entries with an explicit "showing 10 of N" note, never silently truncated.
3. The text is embedded and stored with its source log and task IDs.

No LLM is involved. The earlier OpenAI integration was removed; summaries are always `record`.

### 9.2 Offline embedding (`local-hash-v1`)

A 1536-dimension vector produced with no network or model file:

1. Lowercase, normalise, keep alphanumeric words, drop stop-words, apply a light stemmer (strips endings such as `ing`, `ed`, `s`, `ation`).
2. Count each word (weight 1) and each adjacent word pair (weight 0.5).
3. Hash each feature with FNV-1a into one of 1536 buckets, add or subtract `1 + ln(weight)` depending on a hash bit (signed feature hashing).
4. L2-normalise the vector.

It is deterministic and fast, and related text lands close together because it shares words. It measures **vocabulary overlap, not meaning**: "payment" matches "payment" but not "billing". Text over 16,000 characters is rejected, never truncated. Vectors are validated (exact length, finite numbers, not all zero) before they reach the database.

### 9.3 Staleness

Each snapshot stores the fingerprint. On read, the current fingerprint is recomputed; if it differs (work edited, task reassigned, departure took effect), the API sets `stale: true` and the UI prompts to regenerate.

### 9.4 Similarity search

`POST /api/search/semantic` embeds the question, runs the cosine query over each employee's latest snapshot, then fetches the matching employees from MySQL (dropping any that no longer exist) and returns summary text, similarity and the stale flag. Results are ranked relatedness, not probabilities.

### 9.5 Edit and delete

Editing a snapshot (admin) replaces text and embedding in one `UPDATE`, so they cannot drift apart, keeps the original timestamp and source IDs, and marks it `edited`. Deleting removes the row and its vector.

## 10. Resignation and handover

`POST /api/resignations` validates input (including self-handover) then calls `sp_process_resignation` inside the database. The procedure:

1. Starts its own transaction.
2. Validates: required fields; notice date not in the future; last day not before notice; no self-handover.
3. Locks the departing employee (`FOR UPDATE`) and checks they exist, are active, and joined before the notice date; rejects a second resignation.
4. Locks the successor and checks they are active with no notice of their own.
5. Requires a successor when unfinished tasks exist.
6. Inserts the resignation (the before/after triggers re-verify and also move tasks, so raw SQL follows the same policy).
7. Sets the stored status: `resigned` only if the last working day has already passed, otherwise `active`.
8. Reassigns all unfinished tasks to the successor.
9. Commits. Any error triggers the exit handler: rollback and re-raise.

Resulting behaviour:

- **Notice period** shows as **On notice** in the app and terminal report. The employee can sign in through their last working day, and open tasks move immediately.
- **After the last working day**: they are effectively resigned (computed at read time), cannot sign in, and existing sessions are rejected on the next request.
- **History** is untouched: completed tasks and all work logs keep the original author.
- Anyone with a recorded resignation cannot receive new tasks or act as a successor.

## 11. Frontend pages

Next.js pages router in `app/pages/`, shared layout and widgets in `components/ui.js`, one stylesheet `styles/globals.css`. The sidebar adapts: admins see Overview, Tasks, Work logs, People & projects and Handover; employees see Overview, Tasks, Work logs and My profile. On narrow screens the sidebar becomes a horizontal bar.

| Page | Purpose |
|---|---|
| `/login` | Credentials form with inline error handling |
| `/` | Redirects to the dashboard |
| `/dashboard` | Stat cards (employees, projects, open assignments); admin-only knowledge search box with ranked results and stale warnings; employee directory with name search and department filter (admins) or the employee's own record |
| `/employees/:id` | Profile: status badge, joining and last working day, handover notes; contribution summary with source counts, generate/regenerate button and stale notice; contact edit (phone); saved summary history with Edit and Delete for admins; assigned tasks table; recent work logs |
| `/tasks` | Admin: create and edit tasks (project, assignee, priority, status, dates). Employee: list of own tasks with a status control |
| `/worklogs` | Record work (task, date, hours, notes), edit with author and task locked, team or personal history |
| `/manage` | Admin tabs for Employees (including optional login creation with role), Departments and Projects; create, edit, delete with friendly "in use" refusals |
| `/handover` | Two-step handover: choose employee, last working day, successor and notes, review, confirm; plus handover history |

UI details: inline alerts with `role="alert"`/`status`, `aria-current` on the active nav link, screen-reader labels on inputs, muted text colours checked against a 4.7:1 contrast ratio, and a 390-pixel mobile layout verified with no horizontal overflow.

## 12. Concurrency and data-integrity decisions

| Concern | How it is handled |
|---|---|
| Two admins editing managers at once creating a cycle | A manager change locks the whole (small) employee table in id order, then walks the chain, so competing edits serialise |
| Logging work while a task moves or is reassigned | Work-log creation, task edits and handover all lock employees first, then tasks, always in id order, avoiding deadlocks; a blocked task move rejects a log inserted at the same moment |
| Over-logging a day | The route sums existing hours for that employee and date under a lock and rejects totals above 24; the table `CHECK` still caps any single entry |
| Deleting something that gained history | `deleteWithoutHistory` locks the parent, counts dependants and refuses with 409, so an `ON DELETE CASCADE` can never wipe new records |
| Partial employee creation | Employee row and login are created in one transaction; a duplicate username leaves nothing behind |
| Historical references to people who left | When editing a record whose manager, assignee or department head has since resigned, the existing link is kept; only newly chosen people must be eligible |
| Joining-date edits | Refused if work logs or a resignation would then precede it |
| Stale cookies | Role and employment are re-read from MySQL on every page and API call |

## 13. Infrastructure: Docker Compose and configuration

`compose.yaml` (project name `workload-management-system`):

- **mysql** (`mysql:8.4`, time zone `+05:30`): bound to `127.0.0.1:3307`; mounts `01_schema`, `02_seed`, `04_views`, `05_procedures_functions`, `06_triggers` and `08_roles` into the init directory, so they run on a **new** volume only. Health check queries the `EMPLOYEE` table as the app user. The demo and advanced-query files (`03`, `07`) and the optional extra data (`09`) are deliberately not run at startup.
- **pgvector** (`pgvector/pgvector:pg16`): bound to `127.0.0.1:5433`; mounts `01_setup.sql`; health check queries `ai_work_summaries`.
- Named volumes `mysql_data` and `pgvector_data`; `docker compose stop` keeps data, `down -v` deletes it.
- Ports and passwords can be overridden with `WMS_MYSQL_PORT`, `WMS_PG_PORT`, `WMS_MYSQL_PASSWORD`, `WMS_PG_PASSWORD`.

`app/.env.example` documents the variables: MySQL and PostgreSQL host, port, user, password and database; `NEXTAUTH_SECRET` (generate a random 32-byte value) and `NEXTAUTH_URL` (must match the browser address including host and port). `app/.env.local` is git-ignored.

## 14. Demo data and demo tooling

### 14.1 Extra sample data (`database/mysql/09_demo_extra.sql`)

Optional, loaded by `scripts/demo.sh populate`. Inside a temporary procedure with an "already loaded" guard (safe to re-run) it adds:

- 4 projects: Security Hardening, Mobile App Launch, Data Warehouse Migration, Campus Hiring Drive.
- 14 tasks assigned across active employees, plus extra logs on three existing in-progress tasks.
- About 33 work logs with distinctive vocabulary (OAuth, Redis, React Native, Snowflake, dbt, campus hiring, and so on) so similarity search has varied material.
- 7 new skills and 12 employee-skill links.

Logs are inserted while tasks are in progress, then finished tasks are marked completed, so every row passes through the real triggers. Combined with the seed: 8 projects, 26 tasks and about 58 work logs.

### 14.2 Scripts (`scripts/`)

`scripts/demo.sh` is the single entry point:

| Command | Does |
|---|---|
| `setup` | Starts Compose, refreshes the MySQL views, creates `app/.env.local` if needed, installs dependencies, builds and starts the app |
| `populate` | Loads `09_demo_extra.sql`, then generates or refreshes a summary and embedding for every employee |
| `search ["question"]` | One similarity search, or with no argument a showcase of 7 preset questions |
| `sql` | Runs the SQL walkthrough: row counts, views, function and procedure, a constraint rejection, the DML demo, advanced queries, the pgvector schema and CRUD demo |
| `handover` | Shows current resignation status, dates, departments and skills. Run `npm run handover` from `app/` to use the app's MySQL connection settings |
| `rbac` | Runs the role tests, then live statements as the employee-role account showing allowed and denied results |
| `api` | Live API walkthrough |
| `test` | All automated suites |
| `status`, `stop`, `reset` | Show state, stop (data kept), wipe volumes after confirmation |
| `all` | `setup`, `populate`, `sql`, `rbac`, `api` and the search showcase |

Helpers: `demo-api.mjs` (authentication and role boundaries, summary generation and caching, similarity search, snapshot edit and delete, a full create-employee, assign-task, resign and hand over flow with expected rejections, each printed as PASS or FAIL) and `demo-vector.mjs` (`populate`, `search`, `showcase`). `docs/demo.md` is the presentation talk track.

## 15. Tests

| Suite | Command (from `app/`) | Needs | Covers |
|---|---|---|---|
| Unit and vector | `npm test` | nothing running | Input validation, injection and rollover rejection, role boundaries, payload allow-lists; summary construction, fingerprint changes, compactness limits; offline embedding determinism, normalisation and ranking; real pgvector SQL (via an in-memory PostgreSQL with the actual extension): cosine ranking, latest-only snapshots, model isolation, read/update/delete |
| MySQL fixtures | `WMS_DB_TESTS=1 npm run test:db` | Compose DBs | Seed bcrypt hashes, aggregate correctness, invalid resignations changing nothing, notice-period handover, effective departure, task timestamps and log integrity. A mid-handover fault-injection rollback test runs only if the account may create triggers; otherwise it is reported as skipped |
| Database roles | `npm run test:rbac` | Compose DBs | Eight checks proving each role is accepted or refused exactly as designed |
| HTTP integration | `npm run test:http` | running app | Login, data isolation, forbidden requests, entity CRUD, transactional account creation, work-log rules, history retention, manager cycles, summary caching and staleness, vector search and edit/delete permissions, handover and account expiry |
| Concurrency | `node --env-file=.env.local --test tests/concurrency.integration.mjs` | running app | Blocked project move versus a new log, opposing manager edits, live role changes on existing cookies |
| Browser | `CHROME_PATH=/usr/bin/google-chrome npm run test:browser` | running app, Chrome | Six Playwright scenarios: admin workflows, employee restrictions, mobile layout, historical-reference edits, vector search/edit/delete in the UI, employee read-only snapshots; asserts no console errors |

Notes: the browser config defaults to a Windows Chrome path, so set `CHROME_PATH` on Linux. The browser suite rewrites `docs/screenshots/*.png`. The HTTP and browser suites leave uniquely named fixtures behind by design (history cannot be deleted); run `scripts/demo.sh reset` before a live demo. `app/scripts/test-vector-server.mjs` is an optional in-memory pgvector server on port 35433 for running the app without Docker.

Last full results on this codebase: 17 unit, 11 HTTP, 4 concurrency, 6 browser, 8 role, and 6 MySQL fixture tests passing with 1 skipped (the fault-injection case).

## 16. Documentation and diagrams

| File | Content |
|---|---|
| `README.md` | Setup, accounts, features, handover rules, vector routes, roles, verification commands |
| `docs/demo.md` | 10-minute demonstration plan and viva prompts |
| `docs/implementation.md` | This document |
| `docs/relational_schema.md` | Physical schema reference with keys, constraints and the separate vector table |
| `docs/relational_schema_textbook.drawio` / `.svg` / `.png` | Editable textbook-style relational schema diagram with foreign-key arrows |
| `docs/relational-schema-single-page.pdf/.png` | Black-and-white single-page relational schema |
| `docs/er-diagram-chen-single-page.pdf/.png` | Single-page Chen ER diagram |
| `docs/rubric_mapping.md` | Mapping of features to the marking scheme and remaining submission actions |
| `docs/verification.md` | Dated record of checks that were executed and their limits |
| `docs/project_report.md` | Repository audit and test report |
| `docs/contribution_plan.md` | Planned split of Git commits between contributors |
| `docs/screenshots/` | Dashboard, employee profile and vector history/search captures |
| `database/tests/README.md` | How to run the MySQL fixture and role tests |

## 17. Change history in this repository

| Change | Summary |
|---|---|
| Initial scaffold and continuation | Schema, seed, views, procedures, triggers, API, UI, tests, diagrams |
| Vector read/update/delete | Application-level snapshot history, edit with re-embedding, delete; offline `local-hash-v1` embedding so search works without a key |
| Database-level roles | `08_roles.sql` and the role test |
| Design docs restored | ER diagram, relational schema and rubric mapping |
| OpenAI removal | Provider calls, key and model settings and their simulated tests deleted; summaries are always record-based; vector storage and similarity search kept |
| Demo tooling | `scripts/`, `09_demo_extra.sql`, `docs/demo.md` |
| Single-page ER diagram | PDF and PNG added by a collaborator |

## 18. Known limits and stale spots

- **Similarity is lexical.** `local-hash-v1` matches shared words and word pairs, not meaning. Queries with no overlapping vocabulary score zero. Switching to a neural model means adding a provider, regenerating all summaries and, if the dimension differs, changing the `VECTOR(1536)` column.
- **One application database account.** Per-employee row scope lives in the application; the database roles are demonstrated and tested but are not used for the app's own connections.
- **Fresh databases only.** Bootstrap scripts run only on new volumes; there is no migration path from an older scaffold.
- **Stale wording in places:**
  - A comment in `05_procedures_functions.sql` still says the work-log procedure feeds "the LLM".
  - The header of `01_setup.sql` still says "AI-generated" summaries.
  - The summary panel on the profile page shows "Record-based summary" (accurate) but the history table section is headed "Vector store".
  - `docs/verification.md` and `docs/project_report.md` are dated records of earlier runs and still mention the removed OpenAI tests and the earlier 20-test count.
  - The `.svg` and `.drawio` schema diagrams may still say "provider".
- **Summaries refresh on demand.** There is no background scheduler; staleness is detected on read.
- **Out of scope:** payroll, leave, performance reviews and manager-specific roles.
- **Test hygiene.** Integration suites leave retained fixtures; reset the databases before presenting.
