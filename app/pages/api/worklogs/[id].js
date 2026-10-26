import { getPool } from '../../../lib/mysql';
import { requireSession } from '../../../lib/auth';
import { apiHandler, parseId, date, text, numberValue, assertFields, fail } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  const id=parseId(req.query.id);
  const conn=await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [found]=await conn.execute('SELECT * FROM WORK_LOG WHERE log_id=? FOR UPDATE',[id]);
    const log=found[0];if(!log)fail(404,'Work log not found');
    if(session.user.role!=='admin'&&Number(log.emp_id)!==Number(session.user.empId))fail(403,'You can only edit your own work logs');
    if(req.method==='GET'){await conn.commit();return res.status(200).json(log);}
    if(req.method==='DELETE'){await conn.execute('DELETE FROM WORK_LOG WHERE log_id=?',[id]);await conn.commit();return res.status(204).end();}
    assertFields(req.body,['task_id','emp_id','log_date','hours_spent','notes']);
    if(req.body.task_id!==undefined&&parseId(req.body.task_id,'task_id')!==log.task_id)fail(400,'A saved work log cannot move to another task');
    if(req.body.emp_id!==undefined&&parseId(req.body.emp_id,'emp_id')!==log.emp_id)fail(400,'A saved work log cannot change its author');
    const logDate=req.body.log_date===undefined?log.log_date:date(req.body.log_date,'log_date',{required:true});
    const hours=req.body.hours_spent===undefined?Number(log.hours_spent):numberValue(req.body.hours_spent,'hours_spent',{min:0.01,max:24});
    if(Math.abs(hours*100-Math.round(hours*100))>0.000001)fail(400,'Hours may have at most two decimal places');
    const notes=req.body.notes===undefined?log.notes:text(req.body.notes,'notes');
    const [employees]=await conn.execute('SELECT date_of_joining FROM EMPLOYEE WHERE emp_id=? FOR UPDATE',[log.emp_id]);
    const [today]=await conn.query('SELECT CURDATE() AS today');
    if(logDate>today[0].today||logDate<employees[0].date_of_joining)fail(400,'Log date must be between joining date and today');
    const [totals]=await conn.execute('SELECT COALESCE(SUM(hours_spent),0) AS total FROM WORK_LOG WHERE emp_id=? AND log_date=? AND log_id<>?',[log.emp_id,logDate,id]);
    if(Number(totals[0].total)+hours>24)fail(400,'Total work logged for an employee cannot exceed 24 hours per day');
    await conn.execute('UPDATE WORK_LOG SET log_date=?,hours_spent=?,notes=? WHERE log_id=?',[logDate,hours,notes,id]);
    await conn.commit();return res.status(200).json({success:true});
  }catch(err){await conn.rollback();throw err;}finally{conn.release();}
},['GET','PUT','DELETE']);
