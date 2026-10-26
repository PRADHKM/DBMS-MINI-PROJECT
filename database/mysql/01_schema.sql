-- ============================================================
-- Workload Management System — MySQL DDL (schema)
-- Covers: CREATE, ALTER, PK/FK, constraints, indexes
-- ============================================================

-- Bootstrap a NEW database. Re-running this file does not erase existing data;
-- existing tables deliberately make the import fail instead of resetting them.
CREATE DATABASE IF NOT EXISTS workload_management_system
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE workload_management_system;

-- ------------------------------------------------------------
-- 1. DEPARTMENT
-- ------------------------------------------------------------
CREATE TABLE DEPARTMENT (
    dept_id      INT AUTO_INCREMENT PRIMARY KEY,
    dept_name    VARCHAR(100) NOT NULL UNIQUE,
    head_emp_id  INT NULL
    -- FK to EMPLOYEE added later via ALTER (circular dependency)
);

-- ------------------------------------------------------------
-- 2. EMPLOYEE
-- ------------------------------------------------------------
CREATE TABLE EMPLOYEE (
    emp_id          INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL UNIQUE,
    phone           VARCHAR(15),
    designation     VARCHAR(100),
    dept_id         INT,
    manager_id      INT NULL,
    date_of_joining DATE NOT NULL,
    status          ENUM('active', 'resigned') NOT NULL DEFAULT 'active',
    CONSTRAINT fk_emp_dept FOREIGN KEY (dept_id) REFERENCES DEPARTMENT(dept_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_emp_manager FOREIGN KEY (manager_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ALTER: deferred FK now that EMPLOYEE exists (demonstrates ALTER + FK)
ALTER TABLE DEPARTMENT
    ADD CONSTRAINT fk_dept_head FOREIGN KEY (head_emp_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 3. USER_ACCOUNT (auth + role-based access; min. 2 roles)
-- ------------------------------------------------------------
CREATE TABLE USER_ACCOUNT (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    emp_id         INT NOT NULL UNIQUE,
    username       VARCHAR(50) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,   -- bcrypt hash, never plaintext
    role           ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_emp FOREIGN KEY (emp_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- 4. SKILL
-- ------------------------------------------------------------
CREATE TABLE SKILL (
    skill_id    INT AUTO_INCREMENT PRIMARY KEY,
    skill_name  VARCHAR(100) NOT NULL UNIQUE
);

-- ------------------------------------------------------------
-- 5. EMPLOYEE_SKILL (resolves EMPLOYEE M:N SKILL)
-- ------------------------------------------------------------
CREATE TABLE EMPLOYEE_SKILL (
    emp_id       INT NOT NULL,
    skill_id     INT NOT NULL,
    proficiency  ENUM('beginner', 'intermediate', 'advanced', 'expert') DEFAULT 'intermediate',
    PRIMARY KEY (emp_id, skill_id),
    CONSTRAINT fk_es_emp FOREIGN KEY (emp_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_es_skill FOREIGN KEY (skill_id) REFERENCES SKILL(skill_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- 6. PROJECT
-- ------------------------------------------------------------
CREATE TABLE PROJECT (
    project_id    INT AUTO_INCREMENT PRIMARY KEY,
    project_name  VARCHAR(150) NOT NULL,
    description   TEXT,
    start_date    DATE,
    end_date      DATE,
    status        ENUM('planned', 'ongoing', 'completed', 'on_hold') NOT NULL DEFAULT 'planned',
    dept_id       INT,
    CONSTRAINT fk_project_dept FOREIGN KEY (dept_id) REFERENCES DEPARTMENT(dept_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_project_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- ------------------------------------------------------------
-- 7. TASK
-- ------------------------------------------------------------
CREATE TABLE TASK (
    task_id          INT AUTO_INCREMENT PRIMARY KEY,
    project_id       INT NOT NULL,
    assigned_to      INT,
    title            VARCHAR(150) NOT NULL,
    description      TEXT,
    priority         ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    status           ENUM('not_started', 'in_progress', 'completed', 'blocked') NOT NULL DEFAULT 'not_started',
    start_date       DATE,
    due_date         DATE,
    completion_date  DATE,
    CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES PROJECT(project_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_task_employee FOREIGN KEY (assigned_to) REFERENCES EMPLOYEE(emp_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_task_dates CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);

-- ------------------------------------------------------------
-- 8. WORK_LOG
-- ------------------------------------------------------------
CREATE TABLE WORK_LOG (
    log_id       INT AUTO_INCREMENT PRIMARY KEY,
    task_id      INT NOT NULL,
    emp_id       INT NOT NULL,
    log_date     DATE NOT NULL,
    hours_spent  DECIMAL(4,2) NOT NULL,
    notes        TEXT,
    CONSTRAINT fk_worklog_task FOREIGN KEY (task_id) REFERENCES TASK(task_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_worklog_emp FOREIGN KEY (emp_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_hours_positive CHECK (hours_spent > 0 AND hours_spent <= 24)
);

-- ------------------------------------------------------------
-- 9. RESIGNATION
-- ------------------------------------------------------------
CREATE TABLE RESIGNATION (
    resignation_id    INT AUTO_INCREMENT PRIMARY KEY,
    emp_id            INT NOT NULL UNIQUE,
    resignation_date  DATE NOT NULL,
    last_working_day  DATE NOT NULL,
    handover_notes    TEXT,
    handover_to       INT NULL,
    CONSTRAINT fk_resignation_emp FOREIGN KEY (emp_id) REFERENCES EMPLOYEE(emp_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_resignation_handover FOREIGN KEY (handover_to) REFERENCES EMPLOYEE(emp_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    -- Self-handover is validated by the procedure/trigger. MySQL disallows a
    -- CHECK on these columns because their FKs use cascading referential actions.
    CONSTRAINT chk_resignation_dates CHECK (last_working_day >= resignation_date)
);

-- ============================================================
-- Indexes (beyond the ones MySQL auto-creates for PK/UNIQUE/FK)
-- ============================================================
CREATE INDEX idx_worklog_emp_date ON WORK_LOG(emp_id, log_date);
CREATE INDEX idx_task_project     ON TASK(project_id);
CREATE INDEX idx_task_assigned    ON TASK(assigned_to);
CREATE INDEX idx_task_status      ON TASK(status);
CREATE INDEX idx_user_emp         ON USER_ACCOUNT(emp_id);
CREATE INDEX idx_employee_status  ON EMPLOYEE(status);
CREATE FULLTEXT INDEX idx_worklog_notes_ft ON WORK_LOG(notes);
CREATE FULLTEXT INDEX idx_task_desc_ft     ON TASK(title, description);

-- Example ALTER / DROP demonstrations (kept commented — uncomment to run)
-- ALTER TABLE EMPLOYEE ADD COLUMN linkedin_url VARCHAR(255) NULL;
-- ALTER TABLE EMPLOYEE DROP COLUMN linkedin_url;
-- DROP INDEX idx_employee_status ON EMPLOYEE;
