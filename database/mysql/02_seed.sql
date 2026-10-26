-- ============================================================
-- Workload Management System — Seed Data (DML: INSERT)
-- ============================================================
USE workload_management_system;

-- ------------------------------------------------------------
-- DEPARTMENT
-- ------------------------------------------------------------
INSERT INTO DEPARTMENT (dept_name) VALUES
('Engineering'),
('Product'),
('HR');

-- ------------------------------------------------------------
-- EMPLOYEE  (dept_id: 1=Engineering, 2=Product, 3=HR)
-- ------------------------------------------------------------
INSERT INTO EMPLOYEE (name, email, phone, designation, dept_id, manager_id, date_of_joining, status) VALUES
('Ravi Shankar',    'ravi.shankar@company.com',   '9000000001', 'Engineering Director', 1, NULL, '2019-03-01', 'active'),   -- 1
('Ananya Rao',      'ananya.rao@company.com',     '9000000002', 'Senior Backend Engineer', 1, 1, '2020-06-15', 'active'),  -- 2
('Karthik Iyer',    'karthik.iyer@company.com',   '9000000003', 'Backend Engineer', 1, 2, '2021-11-02', 'active'),         -- 3
('Divya Menon',     'divya.menon@company.com',    '9000000004', 'Frontend Engineer', 1, 2, '2022-01-10', 'active'),       -- 4
('Suresh Pillai',   'suresh.pillai@company.com',  '9000000005', 'DevOps Engineer', 1, 1, '2021-04-20', 'resigned'),       -- 5 (abrupt resignation)
('Meera Nair',      'meera.nair@company.com',     '9000000006', 'Product Manager', 2, NULL, '2020-02-18', 'active'),      -- 6
('Arjun Das',       'arjun.das@company.com',      '9000000007', 'Product Analyst', 2, 6, '2022-07-01', 'active'),         -- 7
('Priya Varma',     'priya.varma@company.com',    '9000000008', 'UX Designer', 2, 6, '2021-09-12', 'active'),             -- 8
('Harish Kumar',    'harish.kumar@company.com',   '9000000009', 'HR Manager', 3, NULL, '2018-05-05', 'active'),           -- 9
('Lakshmi Prasad',  'lakshmi.prasad@company.com', '9000000010', 'HR Executive', 3, 9, '2023-01-20', 'active'),            -- 10
('Vikram Reddy',    'vikram.reddy@company.com',   '9000000011', 'Backend Engineer', 1, 2, '2023-08-14', 'active'),        -- 11
('Sneha Gupta',     'sneha.gupta@company.com',    '9000000012', 'Frontend Engineer', 1, 2, '2023-09-01', 'active');       -- 12

-- Set department heads
UPDATE DEPARTMENT SET head_emp_id = 1 WHERE dept_id = 1;
UPDATE DEPARTMENT SET head_emp_id = 6 WHERE dept_id = 2;
UPDATE DEPARTMENT SET head_emp_id = 9 WHERE dept_id = 3;

-- ------------------------------------------------------------
-- USER_ACCOUNT  (verified bcrypt hashes for the local-demo password
-- "Passw0rd!"; replace these demo accounts before production use)
-- ------------------------------------------------------------
INSERT INTO USER_ACCOUNT (emp_id, username, password_hash, role) VALUES
(1,  'ravi.shankar',   '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'admin'),
(9,  'harish.kumar',   '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'admin'),
(2,  'ananya.rao',     '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(3,  'karthik.iyer',   '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(4,  'divya.menon',    '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(6,  'meera.nair',     '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(7,  'arjun.das',      '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(8,  'priya.varma',    '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(10, 'lakshmi.prasad', '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(11, 'vikram.reddy',   '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee'),
(12, 'sneha.gupta',    '$2a$10$WxUskzn97gW11yikMpBkQ.vcS8AgJv8PTv7aMa3SUseId.kvZuSjS', 'employee');

-- ------------------------------------------------------------
-- SKILL
-- ------------------------------------------------------------
INSERT INTO SKILL (skill_name) VALUES
('Node.js'), ('React'), ('MySQL'), ('Docker'), ('Kubernetes'),
('CI/CD'), ('Figma'), ('Product Analytics'), ('Python'), ('AWS');

-- ------------------------------------------------------------
-- EMPLOYEE_SKILL
-- ------------------------------------------------------------
INSERT INTO EMPLOYEE_SKILL (emp_id, skill_id, proficiency) VALUES
(2, 1, 'expert'), (2, 3, 'advanced'), (2, 9, 'intermediate'),
(3, 1, 'advanced'), (3, 3, 'advanced'),
(4, 2, 'expert'), (4, 7, 'beginner'),
(5, 4, 'expert'), (5, 5, 'expert'), (5, 6, 'advanced'), (5, 10, 'advanced'),
(7, 8, 'advanced'), (7, 9, 'intermediate'),
(8, 7, 'expert'),
(11, 1, 'intermediate'), (11, 3, 'intermediate'),
(12, 2, 'intermediate');

-- ------------------------------------------------------------
-- PROJECT  (dept_id: 1=Engineering, 2=Product)
-- ------------------------------------------------------------
INSERT INTO PROJECT (project_name, description, start_date, end_date, status, dept_id) VALUES
('Payment Gateway Revamp',     'Rebuild the payment processing service for higher throughput.', '2026-01-05', NULL, 'ongoing', 1),
('Infra Migration to K8s',     'Migrate deployment infra from VMs to Kubernetes.',               '2025-09-01', '2026-03-15', 'completed', 1),
('Customer Portal Redesign',   'Redesign the customer-facing web portal UX/UI.',                 '2026-02-10', NULL, 'ongoing', 2),
('Onboarding Analytics',       'Build analytics dashboards for new-user onboarding funnels.',    '2026-04-01', NULL, 'ongoing', 2);

-- ------------------------------------------------------------
-- TASK
-- ------------------------------------------------------------
INSERT INTO TASK (project_id, assigned_to, title, description, priority, status, start_date, due_date, completion_date) VALUES
(1, 2,  'Design new payment service schema',        'Define DB schema for the revamped payment service.', 'high',     'completed',   '2026-01-05', '2026-01-15', '2026-01-14'),
(1, 3,  'Implement idempotency keys',                'Add idempotency handling for payment retries.',      'high',     'completed',   '2026-01-16', '2026-01-30', '2026-01-28'),
(1, 2,  'Load testing payment service',              'Run load tests at 5x expected peak traffic.',        'medium',   'in_progress', '2026-02-01', '2026-02-20', NULL),
(2, 5,  'Containerize legacy services',              'Dockerize the 6 legacy monolith services.',          'high',     'completed',   '2025-09-01', '2025-10-15', '2025-10-10'),
(2, 5,  'Set up K8s cluster + CI/CD pipeline',        'Provision cluster, write Helm charts, wire CI/CD.',  'critical', 'completed',   '2025-10-16', '2026-01-10', '2026-01-08'),
(2, 5,  'Migrate traffic to K8s (phased rollout)',    'Gradually shift production traffic to new cluster.', 'critical', 'completed',   '2026-01-11', '2026-03-15', '2026-03-12'),
(2, 11, 'Write infra runbooks',                       'Document on-call runbooks for the new cluster.',     'medium',   'in_progress', '2026-02-15', NULL, NULL),
(3, 4,  'New portal component library',               'Build shared React component library.',              'high',     'in_progress', '2026-02-10', '2026-03-10', NULL),
(3, 8,  'Portal UX research + wireframes',             'User interviews and wireframes for new portal.',    'high',     'completed',   '2026-02-10', '2026-02-28', '2026-02-26'),
(3, 12, 'Implement responsive nav + dashboard pages',  'Build nav and dashboard pages from new designs.',   'medium',   'in_progress', '2026-03-01', NULL, NULL),
(4, 7,  'Define onboarding funnel events',             'Spec which events to track through onboarding.',    'medium',   'completed',   '2026-04-01', '2026-04-10', '2026-04-09'),
(4, 7,  'Build onboarding dashboard',                  'Dashboard visualizing funnel drop-off.',             'high',     'in_progress', '2026-04-11', NULL, NULL);

-- ------------------------------------------------------------
-- WORK_LOG  (sample of logged hours across employees/months —
-- this is the core "what did employee X actually do" data)
-- ------------------------------------------------------------
INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES
(1, 2, '2026-01-06', 6.0, 'Drafted ER diagram for new payment schema.'),
(1, 2, '2026-01-09', 5.5, 'Reviewed schema with team, revised normalization.'),
(2, 3, '2026-01-16', 7.0, 'Implemented idempotency key middleware.'),
(2, 3, '2026-01-20', 6.5, 'Added Redis-backed dedup cache for retries.'),
(2, 3, '2026-01-27', 4.0, 'Fixed edge case where retry occurred after partial commit.'),
(3, 2, '2026-02-03', 5.0, 'Set up load-testing harness using k6.'),
(3, 2, '2026-02-10', 6.0, 'Ran first load test batch, found connection pool bottleneck.'),
(4, 5, '2025-09-05', 8.0, 'Dockerized auth-service and user-service.'),
(4, 5, '2025-09-18', 7.5, 'Dockerized billing-service and notification-service.'),
(4, 5, '2025-10-02', 6.0, 'Finished dockerizing remaining 2 legacy services, wrote Dockerfiles docs.'),
(5, 5, '2025-10-20', 8.0, 'Provisioned EKS cluster via Terraform.'),
(5, 5, '2025-11-05', 7.0, 'Wrote Helm charts for all 6 services.'),
(5, 5, '2025-12-01', 8.0, 'Wired GitHub Actions CI/CD pipeline to cluster.'),
(5, 5, '2026-01-05', 6.5, 'Hardened cluster network policies and RBAC.'),
(6, 5, '2026-01-15', 7.0, 'Started canary rollout at 10% traffic to new cluster.'),
(6, 5, '2026-02-10', 8.0, 'Scaled rollout to 50% traffic, monitored error rates.'),
(6, 5, '2026-03-10', 8.0, 'Completed 100% cutover, decommissioned old VMs.'),
(7, 11, '2026-02-18', 4.0, 'Drafted outline for on-call runbooks.'),
(8, 4, '2026-02-12', 6.0, 'Set up component library project structure with Storybook.'),
(8, 4, '2026-02-20', 5.5, 'Built Button, Input, Card components.'),
(9, 8, '2026-02-11', 6.0, 'Conducted 5 user interviews on current portal pain points.'),
(9, 8, '2026-02-20', 7.0, 'Produced wireframes for new dashboard layout.'),
(10, 12, '2026-03-02', 5.0, 'Built responsive navbar component.'),
(11, 7, '2026-04-02', 6.0, 'Defined event schema for signup/activation funnel.'),
(12, 7, '2026-04-12', 7.0, 'Built first version of onboarding funnel chart.');

-- ------------------------------------------------------------
-- RESIGNATION  (the motivating scenario — abrupt resignation)
-- ------------------------------------------------------------
INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_notes, handover_to) VALUES
(5, '2026-03-20', '2026-03-27',
 'Handing over K8s cluster ownership and on-call runbooks. See WORK_LOG for full implementation history of the infra migration.',
 11);

-- Keep EMPLOYEE.status consistent with the resignation record
UPDATE EMPLOYEE SET status = 'resigned' WHERE emp_id = 5;
