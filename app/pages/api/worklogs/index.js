import { query, getPool } from '../../../lib/mysql';
import { requireSession } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, text, date, numberValue, assertFields, fail } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  if(req.method==='GET') {
    let sql=`SELECT w.*,t.title AS task_title,p.project_name,e.name AS employee_name FROM WORK_LOG w JOIN TASK t ON t.task_id=w.task_id JOIN PROJECT p ON p.project_id=t.project_id JOIN EMPLOYEE e ON e.emp_id=w.emp_id WHERE 1=1`;
    const params=[];
    const employee=session.user.role==='admin'?optionalId(req.query.emp_id,'emp_id'):session.user.empId;
    if(employee){sql+=' AND w.emp_id=?';params.push(employee);}
    if(req.query.task_id){sql+=' AND w.task_id=?';params.push(parseId(req.query.task_id,'task_id'));}
    return res.status(200).json(await query(sql+' ORDER BY w.log_date DESC,w.log_id DESC',params));
  }
  assertFields(req.body,['task_id','emp_id','log_date','hours_spent','notes']);
  const body=req.body;
  const taskId=parseId(body.task_id,'task_id');
  const employee=session.user.role==='admin'&&body.emp_id?parseId(body.emp_id,'emp_id'):Number(session.user.empId);
  if(session.user.role!=='admin'&&body.emp_id&&Number(body.emp_id)!==employee)fail(403,'You can only log your own work');
  const logDate=date(body.log_date,'log_date',{required:true});
  const hours=numberValue(body.hours_spent,'hours_spent',{min:0.01,max:24});
  if(Math.abs(hours*100-Math.round(hours*100))>0.000001)fail(400,'Hours may have at most two decimal places');
  const notes=text(body.notes,'notes');
  const conn=await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [employees]=await conn.execute(`SELECT e.emp_id,e.date_of_joining FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.emp_id=? AND e.status='active' AND (r.last_working_day IS NULL OR r.last_working_day>=CURDATE()) FOR UPDATE`,[employee]);
    if(!employees.length)fail(400,'Choose an active employee');
    const [today]=await conn.query('SELECT CURDATE() AS today');
    if(logDate>today[0].today||logDate<employees[0].date_of_joining)fail(400,'Log date must be between joining date and today');
    const [tasks]=await conn.execute('SELECT assigned_to,status FROM TASK WHERE task_id=? FOR UPDATE',[taskId]);
    if(!tasks.length)fail(404,'Task not found');
    if(Number(tasks[0].assigned_to)!==employee)fail(400,'Work can only be logged by the employee assigned to this task');
    if(tasks[0].status==='completed')fail(400,'This task is completed. Reopen it before logging more work.');
    const [totals]=await conn.execute('SELECT COALESCE(SUM(hours_spent),0) AS total FROM WORK_LOG WHERE emp_id=? AND log_date=?',[employee,logDate]);
    if(Number(totals[0].total)+hours>24)fail(400,'Total work logged for an employee cannot exceed 24 hours per day');
    const [result]=await conn.execute('INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent,notes) VALUES (?,?,?,?,?)',[taskId,employee,logDate,hours,notes]);
    await conn.commit();return res.status(201).json({log_id:result.insertId});
  } catch(err){await conn.rollback();throw err;}finally{conn.release();}
},['GET','POST']);
