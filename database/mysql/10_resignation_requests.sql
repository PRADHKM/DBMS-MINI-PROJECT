-- Install after the resignation triggers. Safe to apply to an existing database.
USE workload_management_system;

CREATE TABLE IF NOT EXISTS RESIGNATION_REQUEST (
    request_id           INT AUTO_INCREMENT PRIMARY KEY,
    emp_id               INT NOT NULL,
    submitted_on         DATE NOT NULL,
    proposed_last_day    DATE NOT NULL,
    employee_notes       TEXT,
    status               ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    reviewed_by          INT NULL,
    reviewed_at          DATETIME NULL,
    pending_emp_id       INT GENERATED ALWAYS AS (IF(status = 'pending', emp_id, NULL)) STORED,
    UNIQUE KEY uq_pending_resignation_request (pending_emp_id),
    INDEX idx_resignation_request_employee (emp_id, request_id),
    INDEX idx_resignation_request_queue (status, request_id),
    CONSTRAINT fk_request_employee FOREIGN KEY (emp_id) REFERENCES EMPLOYEE(emp_id),
    CONSTRAINT fk_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES EMPLOYEE(emp_id) ON DELETE SET NULL,
    CONSTRAINT chk_request_dates CHECK (proposed_last_day >= submitted_on)
);

DELIMITER $$
DROP TRIGGER IF EXISTS trg_resignation_requires_request_review $$
CREATE TRIGGER trg_resignation_requires_request_review BEFORE INSERT ON RESIGNATION
FOR EACH ROW FOLLOWS trg_resignation_before_insert
BEGIN
    DECLARE v_pending INT DEFAULT NULL;
    SELECT request_id INTO v_pending FROM RESIGNATION_REQUEST
    WHERE pending_emp_id = NEW.emp_id FOR UPDATE;
    IF v_pending IS NOT NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Review the pending resignation request before recording the handover.';
    END IF;
END $$
DELIMITER ;
