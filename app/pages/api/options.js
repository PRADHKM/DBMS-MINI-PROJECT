import { query } from '../../lib/mysql';
import { requireSession } from '../../lib/auth';
import { apiHandler } from '../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  const admin=session.user.role==='admin';const id=session.user.empId;
  const departments=await query('SELECT dept_id,dept_name FROM DEPARTMENT ORDER BY dept_name');
  const employees=admin
    ? await query(`SELECT e.emp_id,e.name,e.dept_id,e.designation,e.status FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.status='active' AND r.emp_id IS NULL ORDER BY e.name`)
    : await query('SELECT emp_id,name,dept_id,designation,status FROM EMPLOYEE WHERE emp_id=?',[id]);
  const projects=await query('SELECT project_id,project_name,status,dept_id FROM PROJECT'+(admin?'':' WHERE project_id IN (SELECT project_id FROM TASK WHERE assigned_to=?)')+' ORDER BY project_name',admin?[]:[id]);
  const tasks=await query('SELECT task_id,title,project_id,assigned_to,status,priority FROM TASK'+(admin?'':' WHERE assigned_to=?')+' ORDER BY title',admin?[]:[id]);
  return res.status(200).json({departments,employees,projects,tasks});
},['GET']);
