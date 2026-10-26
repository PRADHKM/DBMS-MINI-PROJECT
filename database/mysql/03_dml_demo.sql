-- ============================================================
-- Workload Management System — DML Operations Demo
-- Demonstrates: INSERT, UPDATE, DELETE, SELECT,
-- JOIN, GROUP BY, HAVING, ORDER BY, aggregate functions, subqueries
-- ============================================================
USE workload_management_system;
START TRANSACTION;
-- Unique fixture names make this demonstration repeatable. All changes roll
-- back at the end; generated IDs, not guessed IDs, identify the edited rows.
SET @demo_suffix = REPLACE(UUID(), '-', '');

-- ------------------------------------------------------------
-- INSERT — add a new employee + their user account
-- ------------------------------------------------------------
INSERT INTO EMPLOYEE (name, email, phone, designation, dept_id, manager_id, date_of_joining, status)
VALUES ('Rohan Verma (DML demo)', CONCAT(@demo_suffix, '@demo.invalid'), '9000000013', 'Backend Engineer', 1, 2, '2026-10-01', 'active');
SELECT ROW_COUNT() AS inserted_employee_rows;
SET @demo_emp_id = LAST_INSERT_ID();

INSERT INTO USER_ACCOUNT (emp_id, username, password_hash, role)
SELECT @demo_emp_id, CONCAT('demo_', @demo_suffix), password_hash, 'employee'
FROM USER_ACCOUNT WHERE role = 'employee' LIMIT 1;

-- ------------------------------------------------------------
-- UPDATE — promote an employee, log a task status change
-- ------------------------------------------------------------
UPDATE EMPLOYEE SET designation = 'Lead Backend Engineer' WHERE emp_id = @demo_emp_id;
SELECT ROW_COUNT() AS updated_employee_rows;

INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (1, @demo_emp_id, CONCAT('DML task ', @demo_suffix), 'in_progress');
SET @demo_task_id = LAST_INSERT_ID();

UPDATE TASK SET status = 'completed', completion_date = CURDATE()
WHERE task_id = @demo_task_id;
SELECT ROW_COUNT() AS updated_task_rows;

-- ------------------------------------------------------------
-- DELETE — remove a stale/duplicate skill entry
-- ------------------------------------------------------------
INSERT INTO SKILL (skill_name) VALUES (CONCAT('DML skill ', @demo_suffix));
SET @demo_skill_id = LAST_INSERT_ID();
DELETE FROM SKILL WHERE skill_id = @demo_skill_id;
SELECT ROW_COUNT() AS deleted_skill_rows;

-- ------------------------------------------------------------
-- SELECT + JOIN — full work log with task/project context
-- ------------------------------------------------------------
SELECT e.name AS employee, p.project_name, t.title AS task, w.log_date, w.hours_spent, w.notes
FROM WORK_LOG w
JOIN TASK t     ON w.task_id = t.task_id
JOIN PROJECT p  ON t.project_id = p.project_id
JOIN EMPLOYEE e ON w.emp_id = e.emp_id
WHERE e.emp_id = 5
ORDER BY w.log_date;

-- ------------------------------------------------------------
-- SELECT + GROUP BY + HAVING + aggregate — total hours per
-- employee, only those who logged more than 20 hours
-- ------------------------------------------------------------
SELECT e.emp_id, e.name, SUM(w.hours_spent) AS total_hours, COUNT(DISTINCT w.task_id) AS tasks_touched
FROM WORK_LOG w
JOIN EMPLOYEE e ON w.emp_id = e.emp_id
GROUP BY e.emp_id, e.name
HAVING SUM(w.hours_spent) > 20
ORDER BY total_hours DESC;

-- ------------------------------------------------------------
-- SELECT + GROUP BY — project-wise effort breakdown
-- ------------------------------------------------------------
SELECT p.project_name,
       COUNT(DISTINCT t.task_id)           AS total_tasks,
       COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.task_id END) AS completed_tasks,
       COALESCE(SUM(w.hours_spent), 0)     AS total_hours_logged
FROM PROJECT p
LEFT JOIN TASK t     ON t.project_id = p.project_id
LEFT JOIN WORK_LOG w ON w.task_id = t.task_id
GROUP BY p.project_id, p.project_name
ORDER BY total_hours_logged DESC;

-- ------------------------------------------------------------
-- Subquery (simple, non-correlated) — employees who have never
-- logged work (useful for a "needs follow-up" admin view)
-- ------------------------------------------------------------
SELECT emp_id, name, designation
FROM EMPLOYEE
WHERE emp_id NOT IN (SELECT DISTINCT emp_id FROM WORK_LOG);

-- ------------------------------------------------------------
-- Aggregate + ORDER BY — busiest week per employee this quarter
-- ------------------------------------------------------------
SELECT emp_id, YEARWEEK(log_date) AS work_week, SUM(hours_spent) AS weekly_hours
FROM WORK_LOG
WHERE log_date >= '2026-01-01'
GROUP BY emp_id, YEARWEEK(log_date)
ORDER BY weekly_hours DESC
LIMIT 5;

ROLLBACK;
