import { query } from './mysql';
import { fingerprintContext } from './ai.mjs';

export async function loadWorkContext(empId) {
  const employee = (await query(
    `SELECT emp_id, name, designation, effective_status AS status,
            resignation_date, last_working_day
     FROM v_employee_effective_status WHERE emp_id = ?`, [empId]
  ))[0];
  if (!employee) return null;
  const [tasks, worklog] = await Promise.all([
    query(`SELECT t.task_id, t.title, t.status, t.priority, t.due_date, p.project_name
           FROM TASK t JOIN PROJECT p ON p.project_id=t.project_id
           WHERE t.assigned_to=? ORDER BY t.task_id`, [empId]),
    query(`SELECT w.log_id, w.task_id, w.log_date, w.hours_spent, w.notes,
                  t.title AS task_title, p.project_name
           FROM WORK_LOG w JOIN TASK t ON t.task_id=w.task_id
           JOIN PROJECT p ON p.project_id=t.project_id
           WHERE w.emp_id=? ORDER BY w.log_date, w.log_id`, [empId]),
  ]);
  const context = { employee, tasks, worklog };
  return { context, fingerprint: fingerprintContext(context) };
}
