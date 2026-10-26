-- ============================================================
-- Views
-- ============================================================
USE workload_management_system;

-- Compute departures at read time: notice does not end employment early, and
-- a past last working day takes effect without a scheduled database job.
CREATE OR REPLACE VIEW v_employee_effective_status AS
SELECT e.*, r.resignation_date, r.last_working_day,
       CASE WHEN e.status = 'resigned' OR r.last_working_day < CURDATE()
            THEN 'resigned' ELSE 'active' END AS effective_status
FROM EMPLOYEE e
LEFT JOIN RESIGNATION r ON r.emp_id = e.emp_id;

-- View 1: active employee workload summary (for dashboard)
-- Aggregate each child table independently to avoid multiplying hours by the
-- number of open tasks when joining two one-to-many relationships.
CREATE OR REPLACE VIEW v_active_employee_workload AS
SELECT
    e.emp_id,
    e.name,
    e.designation,
    d.dept_name,
    COALESCE(t.active_tasks, 0)           AS active_tasks,
    COALESCE(w.total_hours_logged, 0)     AS total_hours_logged
FROM v_employee_effective_status e
LEFT JOIN DEPARTMENT d ON e.dept_id = d.dept_id
LEFT JOIN (SELECT assigned_to, COUNT(*) AS active_tasks FROM TASK
           WHERE status <> 'completed' GROUP BY assigned_to) t ON t.assigned_to = e.emp_id
LEFT JOIN (SELECT emp_id, SUM(hours_spent) AS total_hours_logged FROM WORK_LOG
           GROUP BY emp_id) w ON w.emp_id = e.emp_id
WHERE e.effective_status = 'active';

-- View 2: project progress overview
CREATE OR REPLACE VIEW v_project_progress AS
SELECT
    p.project_id,
    p.project_name,
    p.status,
    COUNT(t.task_id)                                            AS total_tasks,
    SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)     AS completed_tasks,
    COALESCE(ROUND(100.0 * SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(t.task_id), 0), 1), 0)                 AS pct_complete
FROM PROJECT p
LEFT JOIN TASK t ON t.project_id = p.project_id
GROUP BY p.project_id, p.project_name, p.status;

-- View 3: resigned-employee handover view (the motivating use case)
CREATE OR REPLACE VIEW v_resignation_handover AS
SELECT
    r.resignation_id,
    e.emp_id,
    e.name                       AS resigning_employee,
    e.designation,
    r.resignation_date,
    r.last_working_day,
    h.name                       AS handover_to,
    r.handover_notes,
    (SELECT COUNT(*) FROM TASK t WHERE t.assigned_to = e.emp_id AND t.status != 'completed') AS open_tasks,
    (SELECT COALESCE(SUM(w.hours_spent), 0) FROM WORK_LOG w WHERE w.emp_id = e.emp_id)        AS total_hours_contributed
FROM RESIGNATION r
JOIN EMPLOYEE e ON r.emp_id = e.emp_id
LEFT JOIN EMPLOYEE h ON r.handover_to = h.emp_id;

-- Usage:
-- SELECT * FROM v_active_employee_workload ORDER BY total_hours_logged DESC;
-- SELECT * FROM v_project_progress;
-- SELECT * FROM v_resignation_handover;
