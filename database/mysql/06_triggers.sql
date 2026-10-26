-- Database integrity guards. Import after historical seed data.
USE workload_management_system;
DELIMITER $$

DROP TRIGGER IF EXISTS trg_resignation_before_insert $$
CREATE TRIGGER trg_resignation_before_insert BEFORE INSERT ON RESIGNATION
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_joined DATE;
    DECLARE v_recipient VARCHAR(20) DEFAULT NULL;
    SELECT status, date_of_joining INTO v_status, v_joined
    FROM EMPLOYEE WHERE emp_id = NEW.emp_id FOR UPDATE;
    IF v_status IS NULL OR v_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departing employee must exist and be active.';
    END IF;
    IF NEW.resignation_date > CURDATE() OR NEW.resignation_date < v_joined
       OR NEW.last_working_day < NEW.resignation_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid resignation date range.';
    END IF;
    IF NEW.handover_to = NEW.emp_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An employee cannot hand work over to themselves.';
    END IF;
    IF NEW.handover_to IS NULL AND EXISTS (
        SELECT 1 FROM TASK WHERE assigned_to = NEW.emp_id AND status <> 'completed'
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A handover recipient is required for unfinished tasks.';
    END IF;
    IF NEW.handover_to IS NOT NULL THEN
        SELECT status INTO v_recipient FROM EMPLOYEE
        WHERE emp_id = NEW.handover_to FOR UPDATE;
        IF v_recipient IS NULL OR v_recipient <> 'active'
           OR EXISTS (SELECT 1 FROM RESIGNATION WHERE emp_id = NEW.handover_to) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Handover recipient must be active and have no resignation notice.';
        END IF;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_resignation_after_insert $$
CREATE TRIGGER trg_resignation_after_insert AFTER INSERT ON RESIGNATION
FOR EACH ROW
BEGIN
    UPDATE EMPLOYEE
    SET status = IF(NEW.last_working_day < CURDATE(), 'resigned', 'active')
    WHERE emp_id = NEW.emp_id;
    -- Direct SQL inserts obey the same handover policy as the procedure.
    UPDATE TASK SET assigned_to = NEW.handover_to
    WHERE assigned_to = NEW.emp_id AND status <> 'completed';
END $$

DROP TRIGGER IF EXISTS trg_task_before_insert $$
CREATE TRIGGER trg_task_before_insert BEFORE INSERT ON TASK
FOR EACH ROW
BEGIN
    DECLARE v_employee_status VARCHAR(20) DEFAULT NULL;
    IF NEW.assigned_to IS NOT NULL THEN
        SELECT status INTO v_employee_status FROM EMPLOYEE
        WHERE emp_id = NEW.assigned_to FOR UPDATE;
        IF v_employee_status IS NULL OR v_employee_status <> 'active'
           OR EXISTS (SELECT 1 FROM RESIGNATION WHERE emp_id = NEW.assigned_to) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task assignee must be active and have no resignation notice.';
        END IF;
    END IF;
    IF NEW.status = 'completed' THEN
        SET NEW.completion_date = COALESCE(NEW.completion_date, CURDATE());
    ELSE
        SET NEW.completion_date = NULL;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_task_before_update_complete $$
CREATE TRIGGER trg_task_before_update_complete BEFORE UPDATE ON TASK
FOR EACH ROW
BEGIN
    DECLARE v_employee_status VARCHAR(20) DEFAULT NULL;
    IF NEW.assigned_to IS NOT NULL AND
       (NOT (NEW.assigned_to <=> OLD.assigned_to)
        OR (OLD.status = 'completed' AND NEW.status <> 'completed')) THEN
        SELECT status INTO v_employee_status FROM EMPLOYEE
        WHERE emp_id = NEW.assigned_to FOR UPDATE;
        IF v_employee_status IS NULL OR v_employee_status <> 'active'
           OR EXISTS (SELECT 1 FROM RESIGNATION WHERE emp_id = NEW.assigned_to) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task assignee must be active and have no resignation notice.';
        END IF;
    END IF;
    IF NEW.status = 'completed' THEN
        SET NEW.completion_date = COALESCE(NEW.completion_date, CURDATE());
    ELSE
        SET NEW.completion_date = NULL;
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_worklog_before_insert $$
CREATE TRIGGER trg_worklog_before_insert BEFORE INSERT ON WORK_LOG
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_assigned INT DEFAULT NULL;
    DECLARE v_joined DATE DEFAULT NULL;
    DECLARE v_last DATE DEFAULT NULL;
    SELECT status, assigned_to INTO v_status, v_assigned FROM TASK
    WHERE task_id = NEW.task_id FOR UPDATE;
    IF v_status IS NULL OR v_status = 'completed' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work can only be logged against an unfinished task.';
    END IF;
    IF NOT (v_assigned <=> NEW.emp_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work-log author must be the current task assignee.';
    END IF;
    SELECT e.date_of_joining, r.last_working_day INTO v_joined, v_last
    FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id = e.emp_id
    WHERE e.emp_id = NEW.emp_id;
    IF NEW.log_date > CURDATE() OR NEW.log_date < v_joined
       OR (v_last IS NOT NULL AND NEW.log_date > v_last) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work-log date must fall within employment and cannot be in the future.';
    END IF;
END $$

DROP TRIGGER IF EXISTS trg_worklog_before_update $$
CREATE TRIGGER trg_worklog_before_update BEFORE UPDATE ON WORK_LOG
FOR EACH ROW
BEGIN
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_assigned INT DEFAULT NULL;
    DECLARE v_joined DATE DEFAULT NULL;
    DECLARE v_last DATE DEFAULT NULL;
    -- Notes/hours on historical logs remain editable after handover or task
    -- completion. Moving the entry to another task/author requires fresh checks.
    IF NEW.task_id <> OLD.task_id OR NEW.emp_id <> OLD.emp_id THEN
        SELECT status, assigned_to INTO v_status, v_assigned FROM TASK
        WHERE task_id = NEW.task_id FOR UPDATE;
        IF v_status IS NULL OR v_status = 'completed' OR NOT (v_assigned <=> NEW.emp_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New work-log task must be unfinished and assigned to its author.';
        END IF;
    END IF;
    IF NEW.log_date <> OLD.log_date OR NEW.emp_id <> OLD.emp_id THEN
        SELECT e.date_of_joining, r.last_working_day INTO v_joined, v_last
        FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id = e.emp_id
        WHERE e.emp_id = NEW.emp_id;
        IF NEW.log_date > CURDATE() OR NEW.log_date < v_joined
           OR (v_last IS NOT NULL AND NEW.log_date > v_last) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work-log date must fall within employment and cannot be in the future.';
        END IF;
    END IF;
END $$
DELIMITER ;
