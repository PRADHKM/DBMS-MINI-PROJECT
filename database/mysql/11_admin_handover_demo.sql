-- ADMIN RESIGNATION AND HANDOVER -- MySQL commands only.
-- Run from the repository directory in an admin MySQL session:
-- SOURCE database/mysql/11_admin_handover_demo.sql;
--
-- Creates two new demo employees and their own login usernames.
-- The changes are committed so you can inspect them in the application.
-- Run outside an existing transaction. The resignation procedure owns its transaction.
-- Open tasks transfer when the resignation is recorded with a successor.
-- This example makes the recorded departure effective immediately.

USE workload_management_system;

SELECT CURRENT_USER() AS database_account, CURRENT_ROLE() AS database_role,
       CURDATE() AS database_today;

-- 1. Inspect the existing triggers before changing any data.
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, TRIGGER_NAME;

-- 2. Create a departing HR employee and a new frontend successor.
-- Unique names make the example repeatable.
SET @demo_tag = LEFT(REPLACE(UUID(), '-', ''), 12);
SET @hr_dept = (SELECT dept_id FROM DEPARTMENT WHERE dept_name = 'HR');
SET @frontend_dept = (SELECT dept_id FROM DEPARTMENT WHERE dept_name = 'Engineering');
SET @demo_project = (SELECT MIN(project_id) FROM PROJECT);

START TRANSACTION;

INSERT INTO EMPLOYEE (name, email, designation, dept_id, date_of_joining)
VALUES (CONCAT('SQL HR Employee ', @demo_tag),
        CONCAT('sql.hr.', @demo_tag, '@example.test'),
        'HR Executive', @hr_dept, CURDATE() - INTERVAL 30 DAY);
SET @departing_id = LAST_INSERT_ID();

INSERT INTO EMPLOYEE (name, email, designation, dept_id, date_of_joining)
VALUES (CONCAT('SQL Frontend Employee ', @demo_tag),
        CONCAT('sql.frontend.', @demo_tag, '@example.test'),
        'Frontend Engineer', @frontend_dept, CURDATE());
SET @successor_id = LAST_INSERT_ID();

-- Create individual employee usernames using the seeded demo-password hash.
-- These demo accounts use the same password as the existing ananya.rao account.
INSERT INTO USER_ACCOUNT (emp_id, username, password_hash, role)
SELECT @departing_id, CONCAT('sql.hr.', @demo_tag), password_hash, 'employee'
FROM USER_ACCOUNT WHERE username = 'ananya.rao';

INSERT INTO USER_ACCOUNT (emp_id, username, password_hash, role)
SELECT @successor_id, CONCAT('sql.frontend.', @demo_tag), password_hash, 'employee'
FROM USER_ACCOUNT WHERE username = 'ananya.rao';

-- Give each person their own recorded skill.
INSERT INTO SKILL (skill_name) VALUES (CONCAT('Recruitment demo ', @demo_tag));
SET @hr_skill = LAST_INSERT_ID();
INSERT INTO SKILL (skill_name) VALUES (CONCAT('Frontend demo ', @demo_tag));
SET @frontend_skill = LAST_INSERT_ID();

INSERT INTO EMPLOYEE_SKILL (emp_id, skill_id, proficiency)
VALUES (@departing_id, @hr_skill, 'expert'),
       (@successor_id, @frontend_skill, 'advanced');

-- Create one unfinished task and one completed task.
INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (@demo_project, @departing_id,
        CONCAT('HR outstanding work ', @demo_tag), 'in_progress');
SET @open_task_id = LAST_INSERT_ID();

INSERT INTO TASK (project_id, assigned_to, title, status)
VALUES (@demo_project, @departing_id,
        CONCAT('HR finished work ', @demo_tag), 'completed');
SET @completed_task_id = LAST_INSERT_ID();

-- This INSERT fires trg_worklog_before_insert.
-- The task is unfinished, belongs to its author, and has a valid work date.
INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes)
VALUES (@open_task_id, @departing_id, CURDATE(), 2.5,
        'Documented the outstanding HR work before handing it over.');
SET @work_log_id = LAST_INSERT_ID();

COMMIT;

-- 3. BEFORE resignation.
-- Expect both people to be active, with separate domains, skills and usernames.
SELECT e.emp_id, e.name, u.username, e.designation AS domain_role,
       d.dept_name AS department, e.employment_status, s.skills
FROM v_employee_effective_status e
LEFT JOIN USER_ACCOUNT u ON u.emp_id = e.emp_id
LEFT JOIN DEPARTMENT d ON d.dept_id = e.dept_id
LEFT JOIN v_employee_skills s ON s.emp_id = e.emp_id
WHERE e.emp_id IN (@departing_id, @successor_id);

-- Expect both task owners to be the departing employee.
-- The completed-task INSERT trigger has already filled its completion_date.
SELECT 'BEFORE resignation' AS phase, t.task_id, t.title, t.status,
       t.completion_date, t.assigned_to, e.name AS task_owner
FROM TASK t JOIN EMPLOYEE e ON e.emp_id = t.assigned_to
WHERE t.task_id IN (@open_task_id, @completed_task_id);

-- Expect the work-log author to be the departing employee.
SELECT 'BEFORE resignation' AS phase, w.log_id, w.emp_id AS author_id,
       e.name AS author, w.hours_spent, w.notes
FROM WORK_LOG w JOIN EMPLOYEE e ON e.emp_id = w.emp_id
WHERE w.log_id = @work_log_id;

-- 4. CHANGE -- admin records resignation and chooses the new successor.
-- The procedure calls the resignation triggers, validates the successor,
-- updates employment, and transfers all unfinished tasks in one transaction.
CALL sp_process_resignation(
    @departing_id,
    CURDATE(),
    CURDATE(),
    'New frontend employee takes over the unfinished HR work.',
    @successor_id
);

-- End employment immediately after the resignation has been recorded.
UPDATE EMPLOYEE e
JOIN RESIGNATION r ON r.emp_id = e.emp_id
SET e.status = 'resigned'
WHERE e.emp_id = @departing_id AND r.handover_to = @successor_id;

-- 5. AFTER resignation.
-- Expect the HR employee to be resigned and the frontend employee active.
SELECT 'AFTER resignation' AS phase, emp_id, name, employment_status,
       resignation_date, last_working_day
FROM v_employee_effective_status
WHERE emp_id IN (@departing_id, @successor_id);

-- Expect only the unfinished task to have moved to the new successor.
SELECT 'AFTER resignation' AS phase, t.task_id, t.title, t.status,
       t.assigned_to, e.name AS task_owner
FROM TASK t JOIN EMPLOYEE e ON e.emp_id = t.assigned_to
WHERE t.task_id IN (@open_task_id, @completed_task_id);

-- Expect the original author and 2.5 contributed hours.
SELECT 'AFTER resignation' AS phase, w.log_id, w.emp_id AS author_id,
       e.name AS author, w.hours_spent, w.notes
FROM WORK_LOG w JOIN EMPLOYEE e ON e.emp_id = w.emp_id
WHERE w.log_id = @work_log_id;

-- Show both domains, departments and skills in the recorded handover.
SELECT resigning_employee, designation AS departing_domain_role,
       employee_department, employee_skills, employment_status,
       resignation_date, last_working_day, handover_to,
       successor_designation AS successor_domain_role,
       successor_department, successor_skills, handover_notes
FROM v_resignation_handover WHERE emp_id = @departing_id;

-- The new employee now shows their own frontend domain and the inherited HR domain.
SELECT source_name, designation AS domain_role, dept_name, skills, inherited
FROM v_employee_domains
WHERE emp_id = @successor_id
ORDER BY inherited, source_name;

-- 6. Check the stored function and full historical work summary.
SELECT fn_employee_total_hours(@departing_id, NULL, NULL) AS original_author_hours;
CALL sp_get_employee_worklog_summary(@departing_id);

-- 7. Each check should return 1.
SELECT
    (SELECT assigned_to = @successor_id FROM TASK
     WHERE task_id = @open_task_id) AS open_task_transferred,
    (SELECT assigned_to = @departing_id FROM TASK
     WHERE task_id = @completed_task_id) AS completed_task_preserved,
    (SELECT emp_id = @departing_id FROM WORK_LOG
     WHERE log_id = @work_log_id) AS original_author_preserved,
    (SELECT employment_status = 'resigned' FROM v_employee_effective_status
     WHERE emp_id = @departing_id) AS immediate_status_updated;

-- Optional rejection examples. Run individually to see the expected errors.
-- A duplicate resignation is rejected:
-- CALL sp_process_resignation(@departing_id, CURDATE(), CURDATE(), NULL, @successor_id);
-- Assigning new work to the resigned employee is rejected:
-- INSERT INTO TASK (project_id, assigned_to, title) VALUES (@demo_project, @departing_id, 'Should be rejected');

-- The departing account can no longer sign in after the immediate status update.
