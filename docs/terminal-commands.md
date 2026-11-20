# Workload Management System terminal commands

Run each block in the terminal named above it. Start shell commands from the repository root unless the block changes directory. Use a disposable copy of the demo database for writes, API demonstrations, and tests. The read-only queries and `npm run handover` also work against your regular local database.

## 1. Start the project or connect to an existing copy

**Bash with Docker Compose**. Run these in order for the full demo.

```bash
bash scripts/demo.sh setup       # Start databases, apply migrations, build and start the app
bash scripts/demo.sh populate    # Load extra sample data and generate employee summaries
bash scripts/demo.sh sql         # Run the MySQL and pgvector walkthroughs
bash scripts/demo.sh handover    # Print resignation dates, roles and skills for both people
bash scripts/demo.sh rbac        # Verify database roles and permission denials
bash scripts/demo.sh api         # Run the employee request and admin approval walkthrough
bash scripts/demo.sh search      # Check the seven preset search questions
bash scripts/demo.sh test        # Run the unit, database, API and concurrency suites
bash scripts/demo.sh status      # Check the containers and application
# bash scripts/demo.sh stop      # Run at the end if you want to stop the rehearsal
```

The default Compose app URL is `http://localhost:3000`. The native Windows demo in this workspace uses `http://127.0.0.1:33113`. Use the URL for the instance you intend to test. The native rehearsal used MySQL on port `33317` for isolation from the regular Windows demo.

**PowerShell**. Open the MySQL prompt for your instance using one of these commands.

```powershell
# Compose MySQL. Enter the configured root password at the prompt.
docker compose exec mysql mysql -u root -p workload_management_system

# Native MySQL on Windows. Change the port for your instance.
$mysql = 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe'
& $mysql --no-defaults -h 127.0.0.1 -P 33317 -u root -p workload_management_system
```

**MySQL prompt**. To upgrade an existing native database, start the MySQL client from the repository root. For Compose, use `/docker-entrypoint-initdb.d/` instead of `database/mysql/` in these two paths. Fresh Compose volumes apply the files automatically.

```sql
SOURCE database/mysql/04_views.sql;
SOURCE database/mysql/10_resignation_requests.sql;
```

For a fresh native database, omit the database name when opening the MySQL client. Source these files in order as the schema administrator. The MySQL server and the app's separate connection user are configured separately.

```sql
-- Tables, keys, indexes, employee accounts and sample work.
SOURCE database/mysql/01_schema.sql;
SOURCE database/mysql/02_seed.sql;
-- Reporting, routines, integrity checks and roles.
SOURCE database/mysql/04_views.sql;
SOURCE database/mysql/05_procedures_functions.sql;
SOURCE database/mysql/06_triggers.sql;
SOURCE database/mysql/08_roles.sql;
-- Request table and approval guard, then optional extra samples.
SOURCE database/mysql/10_resignation_requests.sql;
SOURCE database/mysql/09_demo_extra.sql;
```

**PowerShell**. To start the app yourself after configuring `app/.env.local` for your databases, use the development or production commands below. Set `NEXTAUTH_URL` in that file to match the app's hostname and port. Run `npm run dev` in its own terminal so you can keep running the following checks.

```powershell
Push-Location app
npm ci
npm run dev -- -H 127.0.0.1 -p 33114
# For a production run, stop the dev server and run these two commands.
# npm run build
# npm run start -- -H 127.0.0.1 -p 33114
Pop-Location
```

## 2. Check the schema, views and database date

**MySQL prompt**. Use these before making changes so you have the original values for comparison.

```sql
USE workload_management_system;
SELECT CURDATE() AS database_today, @@session.time_zone AS database_time_zone;
SHOW TABLES;
SHOW INDEX FROM TASK;
SHOW CREATE VIEW v_employee_effective_status;
SHOW CREATE VIEW v_resignation_handover;

SELECT emp_id, name, status AS stored_status, effective_status AS account_access,
       employment_status, resignation_date, last_working_day
FROM v_employee_effective_status
ORDER BY emp_id;

SELECT * FROM v_active_employee_workload ORDER BY total_hours_logged DESC;
SELECT * FROM v_project_progress ORDER BY project_id;

SELECT resigning_employee, employment_status, resignation_date, last_working_day,
       employee_department, designation, employee_skills,
       handover_to, successor_department, successor_designation, successor_skills
FROM v_resignation_handover
ORDER BY resignation_date DESC, resignation_id DESC;
```

Read `employment_status` for **Active**, **On notice**, or **Resigned**. The last working day is inclusive for sign-in. MySQL computes the next day's status when you query the view again.

## 3. See what each trigger does before and after a change

**MySQL prompt**. Inspect the installed definitions first. A `BEFORE` trigger validates or changes the proposed row. The resignation `AFTER` trigger updates the employee and their unfinished tasks after the resignation row is inserted.

```sql
SELECT EVENT_OBJECT_TABLE, TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY EVENT_OBJECT_TABLE, EVENT_MANIPULATION, ACTION_TIMING, ACTION_ORDER;

SHOW CREATE TRIGGER trg_task_before_insert;
SHOW CREATE TRIGGER trg_task_before_update_complete;
SHOW CREATE TRIGGER trg_worklog_before_insert;
SHOW CREATE TRIGGER trg_worklog_before_update;
SHOW CREATE TRIGGER trg_resignation_before_insert;
SHOW CREATE TRIGGER trg_resignation_requires_request_review;
SHOW CREATE TRIGGER trg_resignation_after_insert;
```

**MySQL prompt**. Run the next block in one session from `START TRANSACTION` through `ROLLBACK`. The optional commands marked `TRY` are commented out so the block can run as written. To see a rejection, enter that one statement at its indicated step. The transaction uses new employees and tasks, and the last two queries prove the fixtures were removed.

```sql
START TRANSACTION;
SET @lab = REPLACE(UUID(), '-', '');
SET @project = (SELECT MIN(project_id) FROM PROJECT);
SET @hr = (SELECT dept_id FROM DEPARTMENT WHERE dept_name = 'HR');
SET @engineering = (SELECT dept_id FROM DEPARTMENT WHERE dept_name = 'Engineering');
SET @reviewer = (SELECT emp_id FROM USER_ACCOUNT WHERE username = 'ravi.shankar');

INSERT INTO EMPLOYEE (name, email, designation, dept_id, date_of_joining)
VALUES ('Trigger Lab HR', CONCAT('hr-', @lab, '@example.test'), 'HR Executive', @hr, CURDATE() - INTERVAL 30 DAY);
SET @departing = LAST_INSERT_ID();
INSERT INTO EMPLOYEE (name, email, designation, dept_id, date_of_joining)
VALUES ('Trigger Lab Frontend', CONCAT('frontend-', @lab, '@example.test'), 'Frontend Engineer', @engineering, CURDATE() - INTERVAL 30 DAY);
SET @successor = LAST_INSERT_ID();

-- BEFORE INSERT on TASK. Start with a new task with no completion date.
INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (@project, @departing, 'Trigger lab open task', 'in_progress');
SET @open = LAST_INSERT_ID();
SELECT 'New open task' AS phase, task_id, status, completion_date FROM TASK WHERE task_id = @open;

-- INSERT a completed task without supplying completion_date.
-- AFTER the INSERT, completion_date should match CURDATE().
INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (@project, @departing, 'Trigger lab completed task', 'completed');
SET @closed = LAST_INSERT_ID();
SELECT 'New completed task' AS phase, status, completion_date FROM TASK WHERE task_id = @closed;

-- BEFORE UPDATE on TASK. Observe the trigger fill the date on completion and clear it on reopening.
SELECT 'Before completing' AS phase, status, completion_date FROM TASK WHERE task_id = @open;
UPDATE TASK SET status = 'completed' WHERE task_id = @open;
SELECT 'After completing' AS phase, status, completion_date FROM TASK WHERE task_id = @open;
UPDATE TASK SET status = 'in_progress' WHERE task_id = @open;
SELECT 'After reopening' AS phase, status, completion_date FROM TASK WHERE task_id = @open;

-- BEFORE INSERT on WORK_LOG. A log must use the unfinished task, its owner and a valid date.
SELECT COUNT(*) AS logs_before FROM WORK_LOG WHERE task_id = @open;
-- TRY an incorrect author for the open task. Expected SQLSTATE 45000.
-- INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent) VALUES (@open, @successor, CURDATE(), 1);
-- TRY a future work date. Expected SQLSTATE 45000.
-- INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent) VALUES (@open, @departing, CURDATE() + INTERVAL 1 DAY, 1);
-- TRY 25 hours. Expected MySQL error 3819 for chk_hours_positive.
-- INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent) VALUES (@open, @departing, CURDATE(), 25);
INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes)
VALUES (@open, @departing, CURDATE(), 1.50, 'Original contribution');
SET @log = LAST_INSERT_ID();
SELECT 'After adding log' AS phase, emp_id, log_date, hours_spent, notes FROM WORK_LOG WHERE log_id = @log;
-- TRY the BEFORE UPDATE date guard. Expected SQLSTATE 45000.
-- UPDATE WORK_LOG SET log_date = CURDATE() + INTERVAL 1 DAY WHERE log_id = @log;

-- BEFORE approval. Submitting a request leaves the employee active and the task with them.
INSERT INTO RESIGNATION_REQUEST (emp_id, submitted_on, proposed_last_day, employee_notes)
VALUES (@departing, CURDATE(), CURDATE() + INTERVAL 7 DAY, 'Please arrange a successor');
SET @request = LAST_INSERT_ID();
SELECT q.status AS request_status, e.employment_status, t.assigned_to AS open_task_owner
FROM RESIGNATION_REQUEST q JOIN v_employee_effective_status e ON e.emp_id = q.emp_id
JOIN TASK t ON t.task_id = @open WHERE q.request_id = @request;
-- TRY recording a handover while the request is pending. Expected SQLSTATE 45000.
-- INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_to)
-- VALUES (@departing, CURDATE(), CURDATE() + INTERVAL 7 DAY, @successor);

-- CHANGE. In this SQL lab, model the two database writes from an admin approval.
-- The API in section 5 verifies which signed-in user can approve.
UPDATE RESIGNATION_REQUEST SET status = 'approved', reviewed_by = @reviewer, reviewed_at = NOW()
WHERE request_id = @request;
-- TRY a self-handover before the valid insert. Expected SQLSTATE 45000.
-- INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_to)
-- VALUES (@departing, CURDATE(), CURDATE() + INTERVAL 7 DAY, @departing);
INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_to)
VALUES (@departing, CURDATE(), CURDATE() + INTERVAL 7 DAY, @successor);

-- AFTER the resignation insert. The open task moves, the completed task keeps its owner,
-- and the old work log keeps its author. The departing employee is on notice.
SELECT emp_id, employment_status, last_working_day FROM v_employee_effective_status WHERE emp_id = @departing;
SELECT task_id, title, status, assigned_to FROM TASK WHERE task_id IN (@open, @closed);
SELECT log_id, emp_id AS original_author, notes FROM WORK_LOG WHERE log_id = @log;
-- TRY either task-assignee guard. Expected SQLSTATE 45000 because the worker is on notice.
-- INSERT INTO TASK (project_id, assigned_to, title) VALUES (@project, @departing, 'Should be rejected');
-- UPDATE TASK SET assigned_to = @departing WHERE task_id = @open;

-- A notes-only edit to this historical work log remains valid after transfer.
UPDATE WORK_LOG SET notes = 'Clarified the original contribution' WHERE log_id = @log;
SELECT 'After editing notes' AS phase, emp_id AS original_author, notes FROM WORK_LOG WHERE log_id = @log;

-- Advance only this connection's clock to the first day after the last working day.
-- The view should now report resigned. Reset the session clock before continuing.
SET @day_after = UNIX_TIMESTAMP(CURDATE() + INTERVAL 8 DAY);
SET timestamp = @day_after;
SELECT CURDATE() AS simulated_today, status AS stored_status, employment_status
FROM v_employee_effective_status WHERE emp_id = @departing;
SET timestamp = 0;

ROLLBACK;
SELECT COUNT(*) AS fixture_employees_after_rollback FROM EMPLOYEE WHERE emp_id IN (@departing, @successor);
SELECT COUNT(*) AS fixture_tasks_after_rollback FROM TASK WHERE task_id IN (@open, @closed);
```

## 4. Run stored routines and the advanced queries

**MySQL prompt**. Run the read-only commands first. The DML demo creates fixtures, shows affected rows, and rolls back. The advanced file runs joins and subqueries, recursive management CTEs, and full-text ranking.

```sql
SHOW CREATE FUNCTION fn_employee_total_hours;
SHOW CREATE PROCEDURE sp_get_employee_worklog_summary;
SHOW CREATE PROCEDURE sp_process_resignation;

SET @ananya = (SELECT emp_id FROM USER_ACCOUNT WHERE username = 'ananya.rao');
SELECT fn_employee_total_hours(@ananya, '2026-01-01', CURDATE()) AS hours_logged;
CALL sp_get_employee_worklog_summary(@ananya);  -- Profile, work entries and total hours
```

**Native MySQL prompt**. Run these from the repository root. On Compose, run `bash scripts/demo.sh sql` from the shell to feed both files into the container.

```sql
SOURCE database/mysql/03_dml_demo.sql;
SOURCE database/mysql/07_advanced_queries.sql;
```

**MySQL prompt**. Run the direct handover procedure on a disposable database when there is no open transaction. The procedure commits its changes. This example creates and then cleans up its own employee and task. It uses the first active employee as the successor.

```sql
SET @proc_successor = (SELECT emp_id FROM v_employee_effective_status
                       WHERE employment_status = 'active' ORDER BY emp_id LIMIT 1);
SET @proc_project = (SELECT MIN(project_id) FROM PROJECT);
INSERT INTO EMPLOYEE (name, email, date_of_joining)
VALUES ('Procedure Lab Employee', CONCAT(UUID(), '@example.test'), CURDATE() - INTERVAL 30 DAY);
SET @proc_employee = LAST_INSERT_ID();
INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (@proc_project, @proc_employee, 'Procedure lab task', 'in_progress');
SET @proc_task = LAST_INSERT_ID();

-- Before, change, after. Compare the two owners and the resulting notice status.
SELECT 'Before CALL' AS phase, assigned_to FROM TASK WHERE task_id = @proc_task;
CALL sp_process_resignation(@proc_employee, CURDATE(), CURDATE() + INTERVAL 7 DAY,
                            'Procedure lab handover', @proc_successor);
SELECT 'After CALL' AS phase, assigned_to FROM TASK WHERE task_id = @proc_task;
SELECT employment_status FROM v_employee_effective_status WHERE emp_id = @proc_employee;

-- Remove only the new rows from this lab. The resignation is deleted with its employee.
DELETE FROM TASK WHERE task_id = @proc_task;
DELETE FROM EMPLOYEE WHERE emp_id = @proc_employee;
```

Run the `npm run test:db` block in section 7 to verify invalid inputs and rollback after an injected failure.

## 5. Submit, approve and check the handover from PowerShell

For a resignation entered directly by an admin, use the [admin resignation commands](admin-handover-commands.md). They create an HR employee and a new frontend successor, show ownership before the change, record the resignation, and check task transfer and historical work afterward.

Run this against a disposable app instance. Use your app URL and matching database settings. The first script uses separate employee and admin logins. It prints the request in the admin queue, verifies task ownership before approval, approves a frontend successor, then verifies the new owner and employee-visible decision.

```powershell
$env:WMS_URL = 'http://127.0.0.1:33114'  # Change to your disposable app URL
node scripts/demo-api.mjs             # Create demo account, prove access rules, submit, approve and verify

Push-Location app
npm run handover                      # Use the MYSQL settings in app/.env.local
Pop-Location
```

**MySQL prompt**. The live API script prints the demo employee name. Find their latest request and inspect the two records and the transferred task.

```sql
SELECT q.request_id, e.name AS employee, q.status, q.submitted_on, q.proposed_last_day,
       reviewer.name AS approved_by, q.reviewed_at, h.handover_to AS successor, h.employment_status
FROM RESIGNATION_REQUEST q
JOIN EMPLOYEE e ON e.emp_id = q.emp_id
LEFT JOIN EMPLOYEE reviewer ON reviewer.emp_id = q.reviewed_by
LEFT JOIN v_resignation_handover h ON h.emp_id = q.emp_id AND q.status = 'approved'
ORDER BY q.request_id DESC LIMIT 5;

SELECT t.title, e.name AS current_owner, t.status
FROM TASK t LEFT JOIN EMPLOYEE e ON e.emp_id = t.assigned_to
WHERE t.title LIKE 'Demo handover task %' ORDER BY t.task_id DESC LIMIT 5;
```

## 6. Check pgvector and similarity search

**PowerShell with Compose**. Query the installed extension and HNSW index, then pipe the repository's transactional CRUD demo into PostgreSQL.

```powershell
docker compose exec pgvector psql -U wms_app -d workload_management_vectors -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
docker compose exec pgvector psql -U wms_app -d workload_management_vectors -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ai_work_summaries';"
Get-Content -Raw database/pgvector/02_crud_examples.sql | docker compose exec -T pgvector psql -v ON_ERROR_STOP=1 -U wms_app -d workload_management_vectors
```

The SQL file captures generated row IDs, reads and ranks them with cosine distance, updates one vector, deletes the same row, and rolls back. Its two initial similarity values are `1` and `0`. If you have Node and no Docker or `psql`, `npm test` from `app/` runs that same SQL file using the project's in-memory pgvector test database.

**PowerShell**. Point at your disposable app and load the extra MySQL sample data before running the preset showcase.

```powershell
$env:WMS_URL = 'http://127.0.0.1:33114'  # Change to your disposable app URL
node scripts/demo-vector.mjs populate  # Generate summaries and embeddings
node scripts/demo-vector.mjs showcase  # Compare all seven preset search results
node scripts/demo-vector.mjs search 'OAuth refresh token and Redis'  # Karthik Iyer first with the sample data
```

## 7. Run the role checks and automated tests

**MySQL prompt as `wms_employee_db`**. To see the permissions directly, reconnect using that demo account and its configured password. For Compose, run `docker compose exec mysql mysql -u wms_employee_db -p workload_management_system`. For native MySQL, use the connection command from section 1 with `-u wms_employee_db`. Enter the statements one by one because the last three are supposed to return permission errors.

```sql
SELECT CURRENT_ROLE();                           -- Expect wms_employee_role
SELECT COUNT(*) AS employees_visible FROM EMPLOYEE; -- Allowed
SELECT username FROM USER_ACCOUNT;               -- Expect denied
SELECT request_id FROM RESIGNATION_REQUEST;      -- Expect denied
DELETE FROM EMPLOYEE WHERE 1 = 0;                -- Expect denied. This predicate matches no rows.
```

**PowerShell**. Point the test commands at the same disposable app and MySQL database. The RBAC test reads the shell's MySQL settings. The database and concurrency commands also read `app/.env.local`, with shell environment variables taking precedence.

```powershell
Push-Location app
$env:MYSQL_HOST = '127.0.0.1'
$env:MYSQL_PORT = '33317'                # Change to the test MySQL port. Compose default is 3307.
$env:WMS_TEST_URL = 'http://127.0.0.1:33114'  # Change to the running test app URL
$env:WMS_BASE_URL = $env:WMS_TEST_URL
$env:WMS_DB_TESTS = '1'
$env:WMS_SCREENSHOT_DIR = Join-Path ([System.IO.Path]::GetTempPath()) 'wms-browser-checks'

npm test                                # Unit tests and the actual pgvector SQL examples
npm run test:rbac                       # MySQL allows or refuses each statement by role
npm run test:db                         # MySQL routines, handover, rollback and date rules
npm run test:http                       # API permissions, CRUD, summaries and resignation approval
node --env-file=.env.local --test tests/concurrency.integration.mjs
npm run test:browser                    # Browser workflows including the HR-to-frontend approval

Pop-Location
```

Use a test account with trigger creation privileges for the injected failure test. With the default app account, the suite reports a skip when MySQL denies that privilege. The role check confirms the employee database role can read operational tables and that MySQL refuses access to credentials, resignation requests and restricted writes.
