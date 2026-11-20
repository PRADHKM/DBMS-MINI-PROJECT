import { query } from '../../lib/mysql';
import { requireSession } from '../../lib/auth';
import { apiHandler } from '../../lib/api';
import { withEmployeeDomains } from '../../lib/employee-domains';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  const admin=session.user.role==='admin';const id=session.user.empId;
  const departments=await query('SELECT dept_id,dept_name FROM DEPARTMENT ORDER BY dept_name');
  const employees=admin
    ? await query(`SELECT e.emp_id,e.name,e.dept_id,e.designation,e.employment_status AS status,
      d.dept_name,COALESCE(s.skills, JSON_ARRAY()) AS skills FROM v_employee_effective_status e
      LEFT JOIN DEPARTMENT d ON d.dept_id=e.dept_id LEFT JOIN v_employee_skills s ON s.emp_id=e.emp_id
      WHERE e.employment_status='active' ORDER BY e.name`)
    : await query('SELECT emp_id,name,dept_id,designation,employment_status AS status FROM v_employee_effective_status WHERE emp_id=?',[id]);
  const projects=await query('SELECT project_id,project_name,status,dept_id FROM PROJECT'+(admin?'':' WHERE project_id IN (SELECT project_id FROM TASK WHERE assigned_to=?)')+' ORDER BY project_name',admin?[]:[id]);
  const tasks=await query('SELECT task_id,title,project_id,assigned_to,status,priority FROM TASK'+(admin?'':' WHERE assigned_to=?')+' ORDER BY title',admin?[]:[id]);
  const [{today}]=await query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  return res.status(200).json({departments,employees:await withEmployeeDomains(employees),projects,tasks,today});
},['GET']);
