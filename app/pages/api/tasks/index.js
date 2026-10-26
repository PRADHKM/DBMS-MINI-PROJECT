import { query } from '../../../lib/mysql';
import { requireSession, requireRole } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, text, date, enumValue, dateOrder, assertFields, requireRecord, requireAvailableEmployee, insertRecord, TASK_STATUSES, PRIORITIES } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireSession(req,res);if(!session)return;
  if(req.method==='GET') {
    let sql=`SELECT t.*,p.project_name,e.name AS assignee FROM TASK t JOIN PROJECT p ON p.project_id=t.project_id LEFT JOIN EMPLOYEE e ON e.emp_id=t.assigned_to WHERE 1=1`;
    const params=[];
    const assigned=session.user.role==='admin'?optionalId(req.query.assigned_to,'assigned_to'):session.user.empId;
    if(assigned){sql+=' AND t.assigned_to=?';params.push(assigned);}
    if(req.query.project_id){sql+=' AND t.project_id=?';params.push(optionalId(req.query.project_id,'project_id'));}
    if(req.query.status){sql+=' AND t.status=?';params.push(enumValue(req.query.status,'status',TASK_STATUSES));}
    return res.status(200).json(await query(sql+' ORDER BY t.due_date IS NULL,t.due_date,t.task_id DESC',params));
  }
  const admin=await requireRole(req,res,['admin']);if(!admin)return;
  assertFields(req.body,['project_id','assigned_to','title','description','priority','status','start_date','due_date']);
  const body=req.body;
  const values={
    project_id:parseId(body.project_id,'project_id'),assigned_to:optionalId(body.assigned_to,'assigned_to'),
    title:text(body.title,'title',{required:true,max:150}),description:text(body.description,'description'),
    priority:enumValue(body.priority,'priority',PRIORITIES,'medium'),status:enumValue(body.status,'status',TASK_STATUSES,'not_started'),
    start_date:date(body.start_date,'start_date'),due_date:date(body.due_date,'due_date'),
  };
  await requireRecord('PROJECT','project_id',values.project_id);
  await requireAvailableEmployee(values.assigned_to);
  dateOrder(values.start_date,values.due_date,'start_date','due_date');
  if(values.status==='completed')values.completion_date=new Date().toISOString().slice(0,10);
  const id=await insertRecord('TASK',values);
  return res.status(201).json({task_id:id});
},['GET','POST']);
