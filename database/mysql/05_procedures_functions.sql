-- ============================================================
-- Stored Procedures & Functions
-- ============================================================
USE workload_management_system;

DELIMITER $$

-- ------------------------------------------------------------
-- FUNCTION: total hours an employee has logged (optionally
-- within a date range)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_employee_total_hours $$
CREATE FUNCTION fn_employee_total_hours(p_emp_id INT, p_from DATE, p_to DATE)
RETURNS DECIMAL(10,2)
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_total DECIMAL(10,2);
    SELECT COALESCE(SUM(hours_spent), 0) INTO v_total
    FROM WORK_LOG
    WHERE emp_id = p_emp_id
      AND (p_from IS NULL OR log_date >= p_from)
      AND (p_to   IS NULL OR log_date <= p_to);
    RETURN v_total;
END $$

-- Usage: SELECT fn_employee_total_hours(5, '2025-09-01', '2026-03-31');

-- ------------------------------------------------------------
-- PROCEDURE: full work-history dump for one employee — this is
-- exactly the query the AI-summary feature calls before sending
-- context to the LLM for embedding/summarization.
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_get_employee_worklog_summary $$
CREATE PROCEDURE sp_get_employee_worklog_summary(IN p_emp_id INT)
BEGIN
    SELECT e.name, e.designation, d.dept_name
    FROM EMPLOYEE e
    LEFT JOIN DEPARTMENT d ON e.dept_id = d.dept_id
    WHERE e.emp_id = p_emp_id;

    SELECT p.project_name, t.title, t.status, w.log_date, w.hours_spent, w.notes
    FROM WORK_LOG w
    JOIN TASK t    ON w.task_id = t.task_id
    JOIN PROJECT p ON t.project_id = p.project_id
    WHERE w.emp_id = p_emp_id
    ORDER BY w.log_date;

    SELECT fn_employee_total_hours(p_emp_id, NULL, NULL) AS total_hours_all_time;
END $$

-- Usage: CALL sp_get_employee_worklog_summary(5);

-- ------------------------------------------------------------
-- PROCEDURE: process a resignation inside a TRANSACTION —
-- creates the resignation record AND reassigns all that
-- employee's open tasks to the handover person atomically.
-- Demonstrates explicit transaction control (COMMIT/ROLLBACK).
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_process_resignation $$
CREATE PROCEDURE sp_process_resignation(
    IN p_emp_id INT,
    IN p_resignation_date DATE,
    IN p_last_working_day DATE,
    IN p_handover_notes TEXT,
    IN p_handover_to INT
)
proc_block: BEGIN
    DECLARE v_departing_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_joined DATE DEFAULT NULL;
    DECLARE v_recipient_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_open_tasks INT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- This procedure owns its transaction. Call it outside any app transaction.
    START TRANSACTION;

    IF p_emp_id IS NULL OR p_emp_id <= 0 OR p_resignation_date IS NULL
       OR p_last_working_day IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee and resignation dates are required.';
    END IF;
    IF p_resignation_date > CURDATE() OR p_last_working_day < p_resignation_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid resignation date range.';
    END IF;
    IF p_handover_to = p_emp_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An employee cannot hand work over to themselves.';
    END IF;

    -- Serialize departures against task assignment and other resignations.
    SELECT status, date_of_joining INTO v_departing_status, v_joined
    FROM EMPLOYEE WHERE emp_id = p_emp_id FOR UPDATE;
    IF v_departing_status IS NULL OR v_departing_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departing employee must exist and be active.';
    END IF;
    IF p_resignation_date < v_joined THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Resignation cannot precede the joining date.';
    END IF;
    IF EXISTS (SELECT 1 FROM RESIGNATION WHERE emp_id = p_emp_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A resignation has already been recorded for this employee.';
    END IF;

    IF p_handover_to IS NOT NULL THEN
        SELECT status INTO v_recipient_status FROM EMPLOYEE
        WHERE emp_id = p_handover_to FOR UPDATE;
        IF v_recipient_status IS NULL OR v_recipient_status <> 'active'
           OR EXISTS (SELECT 1 FROM RESIGNATION WHERE emp_id = p_handover_to) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Handover recipient must be active and have no resignation notice.';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_open_tasks FROM TASK
    WHERE assigned_to = p_emp_id AND status <> 'completed';
    IF v_open_tasks > 0 AND p_handover_to IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A handover recipient is required for unfinished tasks.';
    END IF;

    INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_notes, handover_to)
    VALUES (p_emp_id, p_resignation_date, p_last_working_day, p_handover_notes, p_handover_to);

    -- Notice leaves the employee active through their last working day.
    -- Effective expiry is computed by v_employee_effective_status and the API.
    UPDATE EMPLOYEE SET status = IF(p_last_working_day < CURDATE(), 'resigned', 'active')
    WHERE emp_id = p_emp_id;

    -- reassign open tasks to the handover employee
    UPDATE TASK
    SET assigned_to = p_handover_to
    WHERE assigned_to = p_emp_id AND status != 'completed';

    COMMIT;
END $$

-- Usage:
-- CALL sp_process_resignation(5, '2026-03-20', '2026-03-27',
--      'Handing over K8s cluster ownership.', 11);

DELIMITER ;
