-- ============================================================
-- Workload Management System - database-level role-based access control
-- ============================================================
-- Two MySQL roles mirror the application roles stored in USER_ACCOUNT.role.
-- The database itself refuses statements outside a role's privileges, so the
-- rules hold even for a client that bypasses the web application.
--
--   wms_admin_role    : full data access (SELECT/INSERT/UPDATE/DELETE, EXECUTE).
--                       No DDL, no GRANT, no trigger or user management.
--   wms_employee_role : read operational data and non-credential views; log work;
--                       update task progress and own phone column only.
--                       No access to USER_ACCOUNT (password hashes), RESIGNATION
--                       or the handover view, and cannot run the handover procedure.
--
-- Two demo accounts receive the roles. Passwords are LOCAL DEMO values: change
-- them for any shared environment. MySQL cannot filter rows per user without
-- views; "employee sees only own rows" remains enforced by the application.
-- Run as a privileged user (Compose runs init scripts as root on new volumes).
-- ============================================================

CREATE ROLE IF NOT EXISTS 'wms_admin_role', 'wms_employee_role';

-- ---------- admin role ----------
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
    ON workload_management_system.* TO 'wms_admin_role';

-- ---------- employee role ----------
GRANT SELECT ON workload_management_system.DEPARTMENT        TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.EMPLOYEE          TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.SKILL             TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.EMPLOYEE_SKILL    TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.PROJECT           TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.TASK              TO 'wms_employee_role';
GRANT SELECT, INSERT, UPDATE, DELETE
                     ON workload_management_system.WORK_LOG  TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.v_employee_effective_status TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.v_active_employee_workload  TO 'wms_employee_role';
GRANT SELECT ON workload_management_system.v_project_progress          TO 'wms_employee_role';
-- Column-level grants: progress fields on TASK and the phone column on EMPLOYEE only.
GRANT UPDATE (status, completion_date) ON workload_management_system.TASK     TO 'wms_employee_role';
GRANT UPDATE (phone)                   ON workload_management_system.EMPLOYEE TO 'wms_employee_role';
GRANT EXECUTE ON FUNCTION  workload_management_system.fn_employee_total_hours           TO 'wms_employee_role';
GRANT EXECUTE ON PROCEDURE workload_management_system.sp_get_employee_worklog_summary   TO 'wms_employee_role';

-- ---------- demo accounts ----------
CREATE USER IF NOT EXISTS 'wms_admin_db'@'%'    IDENTIFIED BY 'wms_admin_db_demo_password';
CREATE USER IF NOT EXISTS 'wms_employee_db'@'%' IDENTIFIED BY 'wms_employee_db_demo_password';
GRANT 'wms_admin_role'    TO 'wms_admin_db'@'%';
GRANT 'wms_employee_role' TO 'wms_employee_db'@'%';
SET DEFAULT ROLE 'wms_admin_role'    TO 'wms_admin_db'@'%';
SET DEFAULT ROLE 'wms_employee_role' TO 'wms_employee_db'@'%';
