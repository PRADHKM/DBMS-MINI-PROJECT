# Workload Management System

A DBMS mini-project for preserving employee contributions and managing work when someone leaves. MySQL stores employees, departments, projects, tasks, work logs and accounts. PostgreSQL with pgvector stores contribution summaries and their embeddings for similarity search.

## Start locally

Requires Node.js 22 or newer, npm, and Docker with Compose. Start in this project folder:

```powershell
docker compose up -d --wait
Copy-Item app/.env.example app/.env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `NEXTAUTH_SECRET` in `app/.env.local`. The example already matches the Compose database names, ports and local demo passwords. Then:

```powershell
cd app
npm ci
npm run dev
```

Open **http://localhost:3000**. `NEXTAUTH_URL` must match the browser URL, including hostname and port. Use the same hostname throughout the session.

| Role | Username | Password |
|---|---|---|
| Admin | `ravi.shankar` | `Passw0rd!` |
| Employee | `ananya.rao` | `Passw0rd!` |
| Employee | `divya.menon` | `Passw0rd!` |

Each active demo employee has a unique login username. The demo accounts share a local demo password. Use **People & projects → Employees** to see the usernames and set up a login for an existing active employee who needs one. When adding an employee there, choose a unique username and an initial password.

Compose binds MySQL to `127.0.0.1:3307` and PostgreSQL to `127.0.0.1:5433` to avoid common existing database ports. Change Compose's `WMS_MYSQL_PORT` / `WMS_PG_PORT` and the matching application environment values if needed. Override demo passwords in Compose and the application together for another environment. `docker compose stop` stops services while preserving their data.

Initialization runs only for new named volumes. For an existing installation of this project, run `scripts/demo.sh setup` from a stopped app. To upgrade manually, open the Compose MySQL client and apply the views and request migration before starting the updated app.

```powershell
docker compose exec mysql mysql -u root -p
```

```sql
SOURCE /docker-entrypoint-initdb.d/04_views.sql;
SOURCE /docker-entrypoint-initdb.d/10_resignation_requests.sql;
```

For native MySQL, use `database/mysql/04_views.sql` and `database/mysql/10_resignation_requests.sql` from the repository directory. Existing employee accounts, tasks and resignation history are retained.

## Demo

Use the [annotated terminal commands](docs/terminal-commands.md) for a step-by-step walkthrough with before-and-after trigger examples.

One command runs everything for a presentation: `scripts/demo.sh all` (databases, app, extra sample data, summaries, SQL/RBAC/API walkthroughs and a similarity-search showcase). See [docs/demo.md](docs/demo.md) for the talk track and `scripts/demo.sh` for individual steps (`populate`, `search "question"`, `sql`, `rbac`, `api`, `test`, `reset`). `database/mysql/09_demo_extra.sql` holds the optional extra data; Compose does not load it.

## Using the application

- **Overview:** employee directory, department filtering, workload counts and admin semantic search.
- **Manage:** admin employee, department and project creation/editing; deletion protects related work history.
- **Tasks:** admin assignment and editing; employees can update the status of their own tasks.
- **Work logs:** employees record and edit their work; admins can manage logs. Author and task remain immutable on edits. Daily hours cannot exceed 24, and dates must fall between joining and today.
- **Employee profile:** contribution history, assigned tasks, phone editing and cached summaries with source counts and stale-data feedback.
- **Resignation:** employees submit a proposed last working day and track whether the request is pending, approved or declined.
- **Handover:** admins review pending requests, confirm the last working day and choose an eligible successor. Approval and open-task transfer happen in one transaction. Admins can also record a resignation received outside the app.

Employees can access only their own profile, tasks and work logs. API checks re-read the account's current role and employment eligibility, including for already signed-in sessions. Employee project/task options are scoped to their assignments; department names are shared reference data.

## Summaries and similarity search

**Generate summary** builds a deterministic **record-based summary** from the employee's work logs and tasks. No external AI service is used. The summary is persisted in PostgreSQL **with a 1536-dimension embedding from the built-in offline model `local-hash-v1`** (signed feature hashing of stemmed words and word pairs). Search embeds the question the same way and ranks stored summaries by cosine distance (`<=>`) in pgvector, so everything runs offline. The model captures shared vocabulary, so similarity is lexical, not neural semantics: "payment" matches "payment", not "billing".

Search ranks each employee's **latest** embedded summary only, filters by embedding model, and flags results whose underlying records have changed. Cosine similarity expresses relatedness; it is not a confidence percentage. Each cached summary stores its source fingerprint, generation method, embedding model and source log/task IDs. Record-based summaries list at most 10 projects/open tasks/completed tasks while stating omitted counts; embedding input is rejected if oversized rather than silently truncated. Fingerprints detect source edits, task reassignment and date-effective departure on the next read. Changing the embedding model requires regenerating summaries; changing dimensions additionally requires a schema change.

### Vector read, update and delete

Summary snapshots in pgvector support full read/update/delete from the application:

| Method and route | Who | Action |
|---|---|---|
| `POST /api/search/semantic` | admin | Embed the question and rank each employee's latest snapshot by cosine similarity |
| `GET /api/employees/:id/summaries` | admin or that employee | List snapshot history (vectors are never returned) |
| `GET /api/summaries/:id` | admin or owner | Read one snapshot |
| `PUT /api/summaries/:id` | admin | Replace text and **re-embed** it in one statement; marks the snapshot `edited` |
| `DELETE /api/summaries/:id` | admin | Remove the snapshot and its vector |

The employee profile page shows the history with **Edit** and **Delete** for admins. `database/pgvector/02_crud_examples.sql` demonstrates the same operations in plain SQL with a rollback.

## Database-level roles

`08_roles.sql` (loaded by Compose on new volumes) creates two MySQL roles that mirror the application roles. `wms_admin_role` has data access and `EXECUTE` but no DDL, `GRANT` or user management. `wms_employee_role` can read operational data and non-credential views, write work logs, update task `status`/`completion_date` and the employee `phone` column only, and cannot read `USER_ACCOUNT` or `RESIGNATION` or run the handover procedure. Demo accounts `wms_admin_db` and `wms_employee_db` (local demo passwords in the file) hold the roles. Run `npm run test:rbac` from `app/` to prove the database accepts or refuses each statement. The web app still connects with the single `wms_app` account and enforces per-employee row scope in code; MySQL cannot filter rows per user without per-user views.

## Handover rules

Resignation notice and departure are different dates. Recording notice transfers open tasks immediately and preserves completed tasks and historical log authors. The app and handover report show **On notice** through the last working day, when the employee can still sign in. Starting the following day in MySQL's time zone, they show **Resigned** and can no longer sign in. Employees with a recorded resignation cannot receive new assignments or act as a new successor. The handover shows the department, designation and recorded skills for both people. Those skill records remain with their respective employees.

After handover, the successor's profile, directory entry and handover selectors show both their own domain and the inherited domains. The profile lists each inherited domain and its skills with the source employee. Further handovers carry these domains forward. Regenerated contribution summaries include inherited domains and skills for knowledge search. The `v_employee_domains` view supplies this information for existing and new handovers.

Run `npm run handover` from the `app` directory to see current statuses, dates, departments and skills from the same MySQL database as the app. With Docker Compose you can also run `scripts/demo.sh handover`. In any MySQL client, use the reporting views:

```sql
SELECT name, employment_status, resignation_date, last_working_day
FROM v_employee_effective_status ORDER BY name;
SELECT * FROM v_resignation_handover ORDER BY resignation_date DESC, resignation_id DESC;
```

The views calculate status when queried; `EMPLOYEE.status` alone does not show notice or date-based expiry. For an existing Docker database, stop the running app before running `scripts/demo.sh setup`, which refreshes the views without removing data. For an existing native MySQL database, run `SOURCE database/mysql/04_views.sql;` as a schema administrator from the repository directory, then restart the rebuilt app.

The stored procedure validates employee existence, notice dates, joining date, successor eligibility, duplicate resignation and self-handover. It locks employees consistently, then inserts the resignation, updates status and transfers tasks in one transaction. A failed step rolls the whole operation back. The UI links to the departing employee's profile to generate the handover summary; summary generation is an explicit separate action so an external provider failure cannot leave a partially processed resignation.

## Architecture and project files

```text
Browser → Next.js pages / role-scoped API routes
                    ├─ MySQL: normalized operational records and credentials
                    └─ PostgreSQL + pgvector: summary snapshots, embeddings and similarity search
```

The application links databases using `emp_id`; a cross-engine foreign key is not claimed. History-preserving deletes prevent removing employees/projects/tasks with retained contribution data. Vector search also excludes orphan employee references.

| Path | Contents |
|---|---|
| `database/mysql/01_schema.sql`, `02_seed.sql` | Tables, constraints, indexes and demo data |
| `database/mysql/04_views.sql`–`06_triggers.sql` | Effective status/workload views, functions, procedures and integrity triggers |
| `database/mysql/08_roles.sql` | Database-level RBAC: `wms_admin_role`, `wms_employee_role` and two demo accounts |
| `database/mysql/09_demo_extra.sql`, `scripts/` | Optional extra sample data and the demo driver scripts |
| `database/mysql/03_dml_demo.sql`, `07_advanced_queries.sql` | DML, joins, aggregation, nested queries, recursive CTEs and full-text examples |
| `database/pgvector/` | Vector schema, HNSW index and CRUD examples (app equivalents in `app/lib/pgvector.js` and `app/pages/api/summaries/`) |
| `app/pages/`, `app/pages/api/` | UI screens and authenticated CRUD/summary/search endpoints |
| `app/lib/` | Database pools, authorization, validation and AI integration |
| `app/tests/`, `database/tests/` | Automated application, SQL and RBAC checks |
| `docs/` | Two-sheet Chen ER model (main and details), physical schema SVG/drawio, rubric map, contribution plan and verification report |

The runtime uses Next.js 15, React 18, NextAuth 4, mysql2, pg and bcryptjs. `package-lock.json` fixes the dependency resolution; use `npm ci` for repeatable installs.

## Verification

From `app/`:

```powershell
npm test
npm run build
npm audit
```

`npm test` checks validation/access rules, the offline embedding, summary evidence, and actual pgvector SQL using an in-memory PostgreSQL engine. It needs no running databases.

For fixture-based MySQL tests against your configured test database:

```powershell
$env:WMS_DB_TESTS = '1'
npm run test:db
```

Read `database/tests/README.md` for the optional fault-injection privilege and test cleanup behavior. With the application running on a disposable demo database:

```powershell
npm run test:http
npm run test:browser
node --env-file=.env.local --test tests/concurrency.integration.mjs
```

HTTP tests and the historical-reference browser regression create uniquely named fixtures and retain handover history intentionally; use a disposable test database. Other browser checks use seeded accounts and restore any edited seed task title. Install a Playwright Chromium browser with `npx playwright install chromium` if local Chrome is absent. `CHROME_PATH` and `WMS_BASE_URL` override browser executable and canonical application URL. `app/scripts/test-vector-server.mjs` is an optional ephemeral pgvector test adapter on loopback port 35433, not the production database.

See `docs/verification.md` for the checks actually executed and their limits. Docker startup itself must be checked on the deployment machine.

## Academic submission

The ER/schema artifacts and rubric mapping are retained from the supplied project. The agreed four-plus-four commit plan is in `docs/contribution_plan.md`; only the user's database/backend groups are committed by the assistant. The friend must review and personally commit the remaining groups. Fill actual names and commit links before submission. Payroll, leave, performance evaluation and manager-specific roles are outside this mini-project. Summaries refresh on demand rather than through a background scheduler.
