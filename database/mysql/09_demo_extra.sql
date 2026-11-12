-- ============================================================
-- Optional extra demo data (NOT loaded by Compose).
-- Adds four more projects, 14 tasks, ~35 work logs and skills across the
-- seeded employees so summaries, similarity search and handover have
-- varied material. Load with:  scripts/demo.sh populate
-- Safe to run once; the guard below skips it if already loaded.
-- Rows are added through the normal triggers: logs are written while a
-- task is in progress, then finished tasks are marked completed.
-- ============================================================
USE workload_management_system;
SET @already := (SELECT COUNT(*) FROM PROJECT WHERE project_name = 'Security Hardening');

DROP PROCEDURE IF EXISTS tmp_demo_extra;
DELIMITER $$
CREATE PROCEDURE tmp_demo_extra()
BEGIN
  IF (SELECT COUNT(*) FROM PROJECT WHERE project_name = 'Security Hardening') = 0 THEN
    START TRANSACTION;

    INSERT INTO PROJECT (project_name, description, start_date, end_date, status, dept_id) VALUES
    ('Security Hardening','Close penetration-test findings and harden authentication and APIs.','2026-05-04',NULL,'ongoing',1),
    ('Mobile App Launch','Ship the customer mobile app for iOS and Android.','2026-05-18',NULL,'ongoing',2),
    ('Data Warehouse Migration','Move reporting from the OLTP database to a cloud data warehouse.','2026-06-01',NULL,'ongoing',1),
    ('Campus Hiring Drive','Recruit and onboard the graduate engineering batch.','2026-06-01','2026-09-30','completed',3);

    INSERT IGNORE INTO SKILL (skill_name) VALUES ('Terraform'), ('Redis'), ('Airflow'), ('Snowflake'), ('React Native'), ('Security Testing'), ('Recruitment');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Security Hardening'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Karthik Iyer');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Implement OAuth2 login with refresh tokens', 'Replace session logins with OAuth2 and refresh token rotation.', 'high', 'in_progress', '2026-05-04', '2026-06-05');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Implement OAuth2 login with refresh tokens';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-06', 7, 'Integrated OAuth2 authorization code flow with PKCE.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Implement OAuth2 login with refresh tokens';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-14', 6.5, 'Built refresh token rotation and revocation list in Redis.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Implement OAuth2 login with refresh tokens';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-28', 5, 'Wrote integration tests for token expiry and replay attacks.');

    UPDATE TASK SET status='completed', completion_date='2026-05-28' WHERE title='Implement OAuth2 login with refresh tokens';

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Security Hardening'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Vikram Reddy');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Add API rate limiting and abuse detection', 'Protect public APIs against brute force and scraping.', 'high', 'in_progress', '2026-06-08', '2026-12-15');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Add API rate limiting and abuse detection';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-10', 6, 'Implemented sliding window rate limiter backed by Redis.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Add API rate limiting and abuse detection';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-24', 5.5, 'Added IP reputation checks and alerting for brute force login attempts.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Security Hardening'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Ananya Rao');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Fix penetration test findings', 'Remediate issues reported by the external security audit.', 'critical', 'in_progress', '2026-05-11', '2026-12-01');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Fix penetration test findings';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-12', 6, 'Patched SQL injection in legacy search endpoint using prepared statements.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Fix penetration test findings';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-19', 4.5, 'Rotated leaked credentials and added secret scanning to the CI pipeline.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Fix penetration test findings';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-02', 5, 'Hardened HTTP headers: CSP, HSTS and secure cookies.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Mobile App Launch'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Divya Menon');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Build React Native app shell and navigation', 'Create the mobile app foundation with navigation and shared components.', 'high', 'in_progress', '2026-05-18', '2026-06-30');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Build React Native app shell and navigation';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-20', 7, 'Set up React Native project with TypeScript and navigation stack.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Build React Native app shell and navigation';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-03', 6, 'Built shared design tokens and reusable mobile components.');

    UPDATE TASK SET status='completed', completion_date='2026-06-03' WHERE title='Build React Native app shell and navigation';

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Mobile App Launch'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Sneha Gupta');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Implement push notifications', 'Send order and promotion notifications to mobile users.', 'medium', 'in_progress', '2026-06-15', '2026-12-20');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Implement push notifications';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-17', 6, 'Integrated Firebase Cloud Messaging for Android and iOS push notifications.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Implement push notifications';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-01', 4, 'Added notification preferences screen and deep links.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Mobile App Launch'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Priya Varma');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Mobile UX testing and accessibility audit', 'Validate the mobile experience with users and assistive technology.', 'high', 'in_progress', '2026-06-01', '2026-12-10');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Mobile UX testing and accessibility audit';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-04', 6, 'Ran usability sessions on the prototype with 8 participants.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Mobile UX testing and accessibility audit';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-18', 5, 'Audited screen reader support and colour contrast on the checkout flow.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Mobile App Launch'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Arjun Das');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Mobile adoption analytics dashboard', 'Track installs, retention and churn for the mobile app.', 'medium', 'in_progress', '2026-07-01', '2026-12-18');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Mobile adoption analytics dashboard';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-03', 5, 'Defined app install and retention funnel events.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Mobile adoption analytics dashboard';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-15', 6.5, 'Built weekly active users and churn dashboard.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Data Warehouse Migration'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Ananya Rao');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Build ETL pipelines into the warehouse', 'Load orders and payments into the cloud warehouse every night.', 'high', 'in_progress', '2026-06-01', '2026-12-05');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Build ETL pipelines into the warehouse';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-03', 7, 'Wrote Python ETL jobs loading orders and payments into Snowflake.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Build ETL pipelines into the warehouse';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-17', 6, 'Scheduled nightly Airflow DAGs with retries and data quality checks.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Data Warehouse Migration'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Karthik Iyer');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Optimize slow analytical queries', 'Cut reporting query latency in the warehouse.', 'medium', 'in_progress', '2026-07-06', '2026-12-12');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Optimize slow analytical queries';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-08', 6, 'Rewrote slow reporting queries using window functions and partition pruning.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Optimize slow analytical queries';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-22', 5, 'Added clustering keys and materialized views, cutting report time by 70 percent.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Data Warehouse Migration'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Vikram Reddy');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Create dbt models for revenue reporting', 'Model revenue marts for finance dashboards.', 'medium', 'in_progress', '2026-08-03', '2026-12-20');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Create dbt models for revenue reporting';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-08-05', 6, 'Created dbt staging and mart models for monthly revenue reporting.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Campus Hiring Drive'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Lakshmi Prasad');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Run campus hiring drive', 'Recruit the graduate batch from partner colleges.', 'high', 'in_progress', '2026-06-01', '2026-09-30');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Run campus hiring drive';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-05', 7, 'Coordinated campus recruitment with five engineering colleges.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Run campus hiring drive';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-06-19', 8, 'Scheduled and conducted first round aptitude interviews for 120 candidates.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Run campus hiring drive';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-08-10', 6, 'Prepared offer letters and onboarding documents for selected graduates.');

    UPDATE TASK SET status='completed', completion_date='2026-08-10' WHERE title='Run campus hiring drive';

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Campus Hiring Drive'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Harish Kumar');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Update employee handbook and leave policy', 'Refresh HR policies for the new batch.', 'medium', 'in_progress', '2026-07-01', '2026-12-30');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Update employee handbook and leave policy';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-03', 5, 'Revised leave policy and remote work guidelines.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Update employee handbook and leave policy';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-07-20', 4.5, 'Drafted code of conduct and grievance procedure updates.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Campus Hiring Drive'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Lakshmi Prasad');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Interview scheduling automation', 'Remove manual calendar coordination from recruiters.', 'low', 'in_progress', '2026-09-01', '2027-01-15');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Interview scheduling automation';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-09-03', 5, 'Automated interview scheduling with calendar integration.');

    SET @pid := (SELECT project_id FROM PROJECT WHERE project_name='Customer Portal Redesign'), @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Meera Nair');
    INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date)
    VALUES (@pid, @eid, 'Quarterly product roadmap planning', 'Prioritise next quarter features across the portal and mobile app.', 'medium', 'in_progress', '2026-09-01', '2026-12-31');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Quarterly product roadmap planning';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-09-04', 4, 'Prioritised the roadmap using customer interview themes and revenue impact.');

    SELECT task_id, assigned_to INTO @tid, @eid FROM TASK WHERE title='Quarterly product roadmap planning';
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-09-18', 3.5, 'Aligned engineering and design on mobile launch scope and release dates.');

    SET @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Vikram Reddy');
    SELECT task_id INTO @tid FROM TASK WHERE title='Write infra runbooks' AND assigned_to=@eid;
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-05', 5, 'Documented Kubernetes cluster failover and node drain procedures.');

    SET @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Vikram Reddy');
    SELECT task_id INTO @tid FROM TASK WHERE title='Write infra runbooks' AND assigned_to=@eid;
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-05-19', 4.5, 'Added on-call runbook for Helm rollback and pod crash loop debugging.');

    SET @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Divya Menon');
    SELECT task_id INTO @tid FROM TASK WHERE title='New portal component library' AND assigned_to=@eid;
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-03-05', 6, 'Added accessible Modal, Dropdown and Table components with Storybook docs.');

    SET @eid := (SELECT emp_id FROM EMPLOYEE WHERE name='Ananya Rao');
    SELECT task_id INTO @tid FROM TASK WHERE title='Load testing payment service' AND assigned_to=@eid;
    INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (@tid, @eid, '2026-02-17', 6, 'Tuned connection pool size and retried load test at five times peak traffic.');

    INSERT IGNORE INTO EMPLOYEE_SKILL (emp_id, skill_id, proficiency)
    SELECT e.emp_id, s.skill_id, v.p FROM (
      SELECT 'Karthik Iyer' AS en, 'Redis' AS sn, 'advanced' AS p
      UNION ALL       SELECT 'Vikram Reddy' AS en, 'Redis' AS sn, 'intermediate' AS p
      UNION ALL       SELECT 'Ananya Rao' AS en, 'Python' AS sn, 'expert' AS p
      UNION ALL       SELECT 'Ananya Rao' AS en, 'Airflow' AS sn, 'advanced' AS p
      UNION ALL       SELECT 'Ananya Rao' AS en, 'Snowflake' AS sn, 'advanced' AS p
      UNION ALL       SELECT 'Ananya Rao' AS en, 'Security Testing' AS sn, 'intermediate' AS p
      UNION ALL       SELECT 'Divya Menon' AS en, 'React Native' AS sn, 'advanced' AS p
      UNION ALL       SELECT 'Sneha Gupta' AS en, 'React Native' AS sn, 'intermediate' AS p
      UNION ALL       SELECT 'Vikram Reddy' AS en, 'Kubernetes' AS sn, 'intermediate' AS p
      UNION ALL       SELECT 'Suresh Pillai' AS en, 'Terraform' AS sn, 'expert' AS p
      UNION ALL       SELECT 'Lakshmi Prasad' AS en, 'Recruitment' AS sn, 'advanced' AS p
      UNION ALL       SELECT 'Harish Kumar' AS en, 'Recruitment' AS sn, 'expert' AS p
    ) v JOIN EMPLOYEE e ON e.name=v.en JOIN SKILL s ON s.skill_name=v.sn;

    COMMIT;
  END IF;
END$$
DELIMITER ;
CALL tmp_demo_extra();
DROP PROCEDURE tmp_demo_extra;

SELECT (SELECT COUNT(*) FROM PROJECT) AS projects, (SELECT COUNT(*) FROM TASK) AS tasks,
       (SELECT COUNT(*) FROM WORK_LOG) AS work_logs, (SELECT COUNT(*) FROM EMPLOYEE_SKILL) AS employee_skills;
