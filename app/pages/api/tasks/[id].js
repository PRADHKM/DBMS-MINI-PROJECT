import { query, getPool } from '../../../lib/mysql';
import { requireSession } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, text, date, enumValue, dateOrder, assertFields, requireRecord, deleteWithoutHistory, fail, TASK_STATUSES, PRIORITIES } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  const id=parseId(req.query.id);const initial=await requireRecord('TASK','task_id',id);
  const admin=session.user.role==='admin';
  if(!admin&&Number(initial.assigned_to)!==Number(session.user.empId))fail(403,'This task is not assigned to you');
  if(req.method==='GET')return res.status(200).json(initial);
  if(req.method==='DELETE') {
    if(!admin)fail(403,'Only an admin can delete a task');
    await deleteWithoutHistory('TASK','task_id',id,'SELECT COUNT(*) AS total FROM WORK_LOG WHERE task_id=?',[id], 'This task has work logs. Keep it to preserve work history.');
    return res.status(204).end();
  }
  assertFields(req.body,admin?['project_id','assigned_to','title','description','priority','status','start_date','due_date']:['status']);
  const values={};
  if(!Object.keys(req.body).length)fail(400,'No fields to update');
  for(const field of Object.keys(req.body)) {
    if(['project_id','assigned_to'].includes(field))values[field]=optionalId(req.body[field],field);
    else if(['start_date','due_date'].includes(field))values[field]=date(req.body[field],field);
    else if(field==='status')values[field]=enumValue(req.body[field],field,TASK_STATUSES);
    else if(field==='priority')values[field]=enumValue(req.body[field],field,PRIORITIES);
    else values[field]=text(req.body[field],field,{required:field==='title',max:field==='title'?150:10000});
  }
  if(values.project_id===null)fail(400,'project_id is required');
  const conn=await getPool().getConnection();
  try {
    await conn.beginTransaction();
    // Work-log creation and handover lock employees before tasks. Follow that
    // order, including any new assignee, before holding the task through its
    // history check and update.
    const employeeIds=[...new Set([initial.assigned_to,values.assigned_to].filter(value=>value!=null))].sort((a,b)=>a-b);
    if(employeeIds.length) await conn.execute(`SELECT emp_id FROM EMPLOYEE WHERE emp_id IN (${employeeIds.map(()=>'?').join(',')}) ORDER BY emp_id FOR UPDATE`,employeeIds);
    const [tasks]=await conn.execute('SELECT * FROM TASK WHERE task_id=? FOR UPDATE',[id]);
    const task=tasks[0];if(!task)fail(404,'Task not found');
    if(task.assigned_to!==initial.assigned_to)fail(409,'Task assignment changed. Refresh and try again.');
    if(!admin&&Number(task.assigned_to)!==Number(session.user.empId))fail(403,'This task is not assigned to you');
    if(values.project_id!==undefined) {
      const [projects]=await conn.execute('SELECT project_id FROM PROJECT WHERE project_id=?',[values.project_id]);
      if(!projects.length)fail(404,'Project not found');
      if(values.project_id!==task.project_id) {
        const [history]=await conn.execute('SELECT COUNT(*) AS total FROM WORK_LOG WHERE task_id=?',[id]);
        if(history[0].total)fail(409,'A task with work logs cannot move to a different project');
      }
    }
    if(values.assigned_to!=null&&values.assigned_to!==task.assigned_to) {
      const [available]=await conn.execute(`SELECT e.emp_id FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.emp_id=? AND e.status='active' AND r.emp_id IS NULL`,[values.assigned_to]);
      if(!available.length)fail(400,'Choose an active employee who has no recorded resignation');
    }
    dateOrder(values.start_date===undefined?task.start_date:values.start_date,values.due_date===undefined?task.due_date:values.due_date,'start_date','due_date');
    await conn.execute(`UPDATE TASK SET ${Object.keys(values).map(field=>field+'=?').join(',')} WHERE task_id=?`,[...Object.values(values),id]);
    await conn.commit();
    return res.status(200).json({success:true});
  }catch(err){await conn.rollback();throw err;}finally{conn.release();}
},['GET','PUT','DELETE']);
