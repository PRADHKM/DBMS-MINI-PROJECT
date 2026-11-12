# Demo guide

About 10 minutes. Story: **Suresh Pillai, the DevOps engineer who ran the Kubernetes migration, resigned abruptly. How do we keep what he knew?**

## Before the demo

```bash
scripts/demo.sh reset      # optional: wipes test fixtures left by earlier test runs (asks first)
scripts/demo.sh all        # databases, app, extra data, summaries, SQL/RBAC/API checks, search showcase
```

`all` is also a full rehearsal. Afterwards the app is running at http://localhost:3000.

| Role | Username | Password |
|---|---|---|
| Admin | `ravi.shankar` | `Passw0rd!` |
| Employee | `ananya.rao` | `Passw0rd!` |

Run the automated test suites any time with `scripts/demo.sh test`.

## Live walkthrough (browser)

1. **Overview** (sign in as admin). 12 seeded people plus the extra demo data: 10 projects, 35 tasks, about 60 work logs. Point out workload counts and the Resigned badge on Suresh.
2. **Open Suresh Pillai's profile.** His contribution history is complete even though he left: ten work logs on the Kubernetes migration (EKS via Terraform, Helm charts, CI/CD, canary rollout, cutover). Show the stored summary snapshot: record-based, with source log and task counts.
3. **Handover page.** Show his resignation: notice date, last working day, notes, successor Vikram Reddy. The open "Write infra runbooks" task belongs to Vikram, while Suresh keeps his completed tasks and every work log he wrote. To show the live transfer, record a new resignation (Handover page, or `scripts/demo.sh api`) and watch the successor receive the open task.
4. **Similarity search** (Overview, admin only). Type a question; results are ranked by cosine similarity over stored embeddings:
   - `Kubernetes cluster and Helm rollout` finds Suresh.
   - `payment service load testing` finds Ananya.
   - `OAuth refresh token and Redis` finds Karthik.
   - `campus hiring interviews` finds Lakshmi.
   - `push notifications React Native` finds Sneha, then Divya.
   - `onboarding funnel dashboard` finds Arjun.
5. **Edit a snapshot** on a profile (admin): change the text, Save. The text is re-embedded in the same statement; search for the new words and the employee moves up. Delete a snapshot to show the vector row disappears.
6. **Role boundaries.** Sign out, sign in as `ananya.rao`: only her own profile, tasks and work logs; no handover page, no search, no edit/delete on snapshots.
7. **Log work.** As Ananya, add a work log. Try 25 hours or a future date and show the rejection.

Honest limits to mention: embeddings come from the offline `local-hash-v1` model, so similarity is shared vocabulary ("payment" matches "payment", not "billing"). Use words that appear in the work notes.

## Terminal walkthrough (database features)

```bash
scripts/demo.sh sql      # tables, 4 views, function, procedure, constraint error, DML (rolled back), advanced queries, pgvector CRUD
scripts/demo.sh rbac     # MySQL roles: employee role denied on USER_ACCOUNT and DELETE; admin role allowed data but not DDL
scripts/demo.sh api      # auth, summary, similarity search, vector edit and delete, handover
scripts/demo.sh search "your own question"
```

Good SQL talking points (all in `database/mysql/`):

| Topic | Where |
|---|---|
| Normalised schema, constraints, indexes | `01_schema.sql` |
| Views for effective status and workload | `04_views.sql` |
| Transactional handover procedure with rollback | `05_procedures_functions.sql` (`sp_process_resignation`) |
| Triggers guarding logs, tasks and resignations | `06_triggers.sql` |
| Correlated and nested subqueries, recursive CTEs, full-text | `07_advanced_queries.sql` |
| Database-level roles | `08_roles.sql` |
| Vector table, HNSW index, cosine search | `database/pgvector/01_setup.sql`, `02_crud_examples.sql` |

Suggested viva questions to rehearse: why two databases and no cross-database foreign key; why HNSW rather than IVFFlat on an empty table; what the handover procedure locks and why; why summaries carry a source fingerprint (stale detection).

## Resetting between runs

`scripts/demo.sh reset` deletes both database volumes; the next `scripts/demo.sh all` rebuilds and re-seeds everything. The HTTP and browser test suites create uniquely named fixtures (`http_…`, `Browser retention…`) that history rules do not allow deleting, so reset before a live demo if you ran them.
