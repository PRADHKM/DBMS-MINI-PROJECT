# Database verification

The application dependencies must be installed first. Start fresh databases with
`docker compose up -d --wait` from the project root, and configure `app/.env.local`
using the Docker ports/passwords documented in the main README. Bootstrap scripts
run only for new named volumes; existing volumes are preserved. These scripts are
not an in-place migration for an older installation.

From `app/`, run the fixture-based MySQL tests in PowerShell:

```powershell
$env:WMS_DB_TESTS = '1'
node --env-file=.env.local ../database/tests/mysql-integration.cjs
```

The test creates uniquely named employees, a project, tasks and logs, then removes
them in `finally`. It never resets the database or changes the supplied demo rows.
Each test and the final result are printed as JSON for CI or log capture.

Checks cover demo password hashes, correct aggregate hours, invalid resignations,
immediate task transfer during notice, preserved historical authorship, effective
departure dates, task timestamps and work-log ownership. An injected database
trigger also proves that a failure during handover rolls back the resignation,
employee status and task updates together. That fault-injection check is reported
as skipped if the test account cannot create triggers under its server's binary
logging policy. Run it with privileges on a disposable database to verify it;
application accounts do not need elevated server privileges.

This project was verified against an isolated MySQL Community Server 8.0.46 with
all seven groups passing and no skips. Fresh schema, seed, views, procedures,
triggers and the advanced-query examples all imported/executed successfully.
The Docker Compose services require Docker and were not started in this workspace.
PostgreSQL/pgvector runtime verification is reported separately in the main README.

Resignation notices transfer unfinished tasks immediately, retain completed-task
ownership and retain every work log's original author. The employee remains active
through the last working day. `v_employee_effective_status` and API authorization
compute expired employment on reads, so a scheduled status-update job is unnecessary.
Employees with any resignation notice cannot receive newly assigned tasks or a
handover, including during their own notice period.
