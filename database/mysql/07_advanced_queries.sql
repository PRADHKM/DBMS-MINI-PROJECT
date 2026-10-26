-- ============================================================
-- Advanced Queries — Nested / Correlated Subqueries, Recursive CTE
-- ============================================================
USE workload_management_system;

-- ------------------------------------------------------------
-- CORRELATED SUBQUERY — employees whose total logged hours
-- exceed their department's average logged hours
-- ------------------------------------------------------------
SELECT e.emp_id, e.name, e.dept_id,
       (SELECT COALESCE(SUM(w.hours_spent), 0)
        FROM WORK_LOG w WHERE w.emp_id = e.emp_id) AS my_hours
FROM EMPLOYEE e
WHERE (SELECT COALESCE(SUM(w.hours_spent), 0)
       FROM WORK_LOG w WHERE w.emp_id = e.emp_id)
      > (SELECT AVG(dept_hours.total)
         FROM (
             SELECT e2.emp_id, COALESCE(SUM(w2.hours_spent), 0) AS total
             FROM EMPLOYEE e2
             LEFT JOIN WORK_LOG w2 ON w2.emp_id = e2.emp_id
             GROUP BY e2.emp_id, e2.dept_id
         ) AS dept_hours
         JOIN EMPLOYEE de ON de.emp_id = dept_hours.emp_id
         WHERE de.dept_id = e.dept_id)
ORDER BY my_hours DESC;

-- ------------------------------------------------------------
-- NESTED SUBQUERY (non-correlated) — projects with at least one
-- high/critical priority task still not completed
-- ------------------------------------------------------------
SELECT project_name
FROM PROJECT
WHERE project_id IN (
    SELECT project_id FROM TASK
    WHERE priority IN ('high', 'critical') AND status != 'completed'
);

-- ------------------------------------------------------------
-- CORRELATED SUBQUERY in SELECT list — each employee's most
-- recent work_log entry date
-- ------------------------------------------------------------
SELECT e.emp_id, e.name,
       (SELECT MAX(w.log_date) FROM WORK_LOG w WHERE w.emp_id = e.emp_id) AS last_logged_on
FROM EMPLOYEE e
ORDER BY last_logged_on DESC;

-- ------------------------------------------------------------
-- RECURSIVE CTE — full management chain (org hierarchy) for a
-- given employee, walking up through manager_id
-- ------------------------------------------------------------
WITH RECURSIVE manager_chain AS (
    SELECT emp_id, name, manager_id, 0 AS depth
    FROM EMPLOYEE
    WHERE emp_id = 3              -- start: Karthik Iyer
    UNION ALL
    SELECT e.emp_id, e.name, e.manager_id, mc.depth + 1
    FROM EMPLOYEE e
    JOIN manager_chain mc ON e.emp_id = mc.manager_id
)
SELECT * FROM manager_chain ORDER BY depth;

-- ------------------------------------------------------------
-- RECURSIVE CTE — entire org chart downward (everyone who
-- ultimately reports, directly or indirectly, to a given manager)
-- ------------------------------------------------------------
WITH RECURSIVE org_chart AS (
    SELECT emp_id, name, manager_id, 0 AS level
    FROM EMPLOYEE
    WHERE emp_id = 1              -- root: Ravi Shankar (Engineering Director)
    UNION ALL
    SELECT e.emp_id, e.name, e.manager_id, oc.level + 1
    FROM EMPLOYEE e
    JOIN org_chart oc ON e.manager_id = oc.emp_id
)
SELECT * FROM org_chart ORDER BY level, emp_id;

-- ------------------------------------------------------------
-- Plain (non-recursive) CTE — reusable "employee hours" building
-- block used by a bigger query (clearer than nested derived tables)
-- ------------------------------------------------------------
WITH employee_hours AS (
    SELECT emp_id, SUM(hours_spent) AS total_hours
    FROM WORK_LOG
    GROUP BY emp_id
)
SELECT e.name, e.designation, eh.total_hours
FROM employee_hours eh
JOIN EMPLOYEE e ON e.emp_id = eh.emp_id
WHERE eh.total_hours > (SELECT AVG(total_hours) FROM employee_hours)
ORDER BY eh.total_hours DESC;

-- ------------------------------------------------------------
-- Full-text search demo (uses the FULLTEXT indexes from 01_schema.sql)
-- "What has anyone done related to Kubernetes / cluster work?"
-- ------------------------------------------------------------
SELECT e.name, w.log_date, w.notes,
       MATCH(w.notes) AGAINST('Kubernetes cluster' IN NATURAL LANGUAGE MODE) AS relevance
FROM WORK_LOG w
JOIN EMPLOYEE e ON w.emp_id = e.emp_id
WHERE MATCH(w.notes) AGAINST('Kubernetes cluster' IN NATURAL LANGUAGE MODE)
ORDER BY relevance DESC;
