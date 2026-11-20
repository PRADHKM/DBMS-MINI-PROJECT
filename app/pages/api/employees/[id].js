import { query, getPool } from '../../../lib/mysql';
import { requireSession, requireRole } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, text, date, assertFields, canAccessEmployee, fail, deleteWithoutHistory } from '../../../lib/api';
import { insertEmployeeAccount, prepareEmployeeAccount } from '../../../lib/employee-account';
import { requireNoResignation } from '../../../lib/resignation-requests';
import { loadEmployeeDomains } from '../../../lib/employee-domains';

export default apiHandler(async (req, res) => {
  const session = await requireSession(req,res); if (!session) return;
  const id = parseId(req.query.id);
  if (!canAccessEmployee(session.user,id)) fail(403,'You can only access your own profile');
  const employee = (await query(`SELECT e.*,d.dept_name,m.name AS manager_name,r.handover_to,r.handover_notes
    FROM v_employee_effective_status e LEFT JOIN DEPARTMENT d ON d.dept_id=e.dept_id
    LEFT JOIN EMPLOYEE m ON m.emp_id=e.manager_id LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.emp_id=?`, [id]))[0];
  if (!employee) fail(404,'Employee not found');
  employee.status = employee.employment_status;
  delete employee.employment_status;
  if (req.method === 'GET') {
    employee.domains = (await loadEmployeeDomains([id])).get(id);
    if (session.user.role === 'admin') {
      const [account] = await query('SELECT username FROM USER_ACCOUNT WHERE emp_id=?', [id]);
      employee.login_username = account?.username ?? null;
    }
    const tasks = await query(`SELECT t.*,p.project_name FROM TASK t JOIN PROJECT p ON p.project_id=t.project_id WHERE t.assigned_to=? ORDER BY t.status,t.due_date`,[id]);
    const worklog = await query(`SELECT w.*,t.title AS task_title,p.project_name FROM WORK_LOG w JOIN TASK t ON t.task_id=w.task_id JOIN PROJECT p ON p.project_id=t.project_id WHERE w.emp_id=? ORDER BY w.log_date DESC,w.log_id DESC`,[id]);
    return res.status(200).json({employee,tasks,worklog});
  }
  if (req.method === 'PUT') {
    const admin = session.user.role === 'admin';
    const fields = admin ? ['name','email','phone','designation','dept_id','manager_id','date_of_joining'] : ['phone'];
    assertFields(req.body, admin ? [...fields, 'username', 'password', 'role'] : fields);
    const account = admin ? await prepareEmployeeAccount(req.body) : null;
    const values={};
    for (const field of fields.filter(field => Object.hasOwn(req.body, field))) {
      if (['dept_id','manager_id'].includes(field)) values[field]=optionalId(req.body[field],field);
      else if (field==='date_of_joining') values[field]=date(req.body[field],field,{required:true});
      else values[field]=text(req.body[field],field,{required:['name','email'].includes(field),max:field==='phone'?15:100});
    }
    if(!Object.keys(values).length && !account)fail(400,'No fields to update');
    if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))fail(400,'A valid email is required');
    const conn=await getPool().getConnection();
    try {
      await conn.beginTransaction();
      let employees;
      if(Object.hasOwn(values,'manager_id')) {
        // Hierarchy changes are rare in this mini-project. Locking the small
        // employee set in one consistent order serializes competing A-to-B/B-to-A
        // edits, so each cycle walk observes the previous committed hierarchy.
        [employees]=await conn.query('SELECT emp_id,manager_id,status FROM EMPLOYEE ORDER BY emp_id FOR UPDATE');
      } else {
        [employees]=await conn.execute('SELECT emp_id,manager_id,status FROM EMPLOYEE WHERE emp_id=? FOR UPDATE',[id]);
      }
      const current=employees.find(row=>row.emp_id===id);
      if(!current)fail(404,'Employee not found');
      if(values.manager_id!=null&&values.manager_id!==current.manager_id) {
        const [available]=await conn.execute(`SELECT e.emp_id FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.emp_id=? AND e.status='active' AND r.emp_id IS NULL`,[values.manager_id]);
        if(!available.length)fail(400,'Choose an active employee who has no recorded resignation');
        const byId=new Map(employees.map(row=>[row.emp_id,row]));
        let next=values.manager_id;const visited=new Set([id]);
        while(next) {
          if(visited.has(next))fail(400,'Manager relationship would create a cycle');
          visited.add(next);
          const manager=byId.get(next);if(!manager)fail(404,'Manager not found');
          next=manager.manager_id;
        }
      }
      if(values.date_of_joining) {
        const [conflicts]=await conn.execute(`SELECT
          (SELECT COUNT(*) FROM WORK_LOG WHERE emp_id=? AND log_date<?)+
          (SELECT COUNT(*) FROM RESIGNATION WHERE emp_id=? AND resignation_date<?)+
          (SELECT COUNT(*) FROM RESIGNATION_REQUEST WHERE emp_id=? AND submitted_on<?) AS total`,
          [id,values.date_of_joining,id,values.date_of_joining,id,values.date_of_joining]);
        if(conflicts[0].total)fail(409,'Joining date cannot move after recorded work or resignation history');
      }
      if(values.dept_id) {
        const [departments]=await conn.execute('SELECT dept_id FROM DEPARTMENT WHERE dept_id=?',[values.dept_id]);
        if(!departments.length)fail(404,'Department not found');
      }
      if (account) {
        await requireNoResignation(conn, current);
        const [accounts] = await conn.execute('SELECT user_id FROM USER_ACCOUNT WHERE emp_id=? FOR UPDATE', [id]);
        if (accounts.length) fail(409, 'This employee already has a login.');
        await insertEmployeeAccount(conn, id, account);
      }
      if (Object.keys(values).length) {
        await conn.execute(`UPDATE EMPLOYEE SET ${Object.keys(values).map(field=>field+'=?').join(',')} WHERE emp_id=?`,[...Object.values(values),id]);
      }
      await conn.commit();return res.status(200).json({success:true});
    }catch(err){await conn.rollback();throw err;}finally{conn.release();}
  }
  const admin=await requireRole(req,res,['admin']); if (!admin) return;
  if (id===Number(session.user.empId)) fail(400,'You cannot delete your own account');
  await deleteWithoutHistory('EMPLOYEE','emp_id',id,`SELECT
    (SELECT COUNT(*) FROM WORK_LOG WHERE emp_id=?) + (SELECT COUNT(*) FROM TASK WHERE assigned_to=?) +
    (SELECT COUNT(*) FROM RESIGNATION WHERE emp_id=? OR handover_to=?) +
    (SELECT COUNT(*) FROM RESIGNATION_REQUEST WHERE emp_id=?) AS total`,[id,id,id,id,id],
    'This employee has work or handover history. Use the resignation workflow to preserve it.');
  return res.status(204).end();
},['GET','PUT','DELETE']);
