import { query } from './mysql';
import { requireSession, requireRole } from './auth';
import { apiHandler, assertFields, text, optionalId, date, enumValue, dateOrder, parseId, requireRecord, requireAvailableEmployee, insertRecord, updateRecord, deleteWithoutHistory, PROJECT_STATUSES } from './api';

const configs={
  departments: {table:'DEPARTMENT',key:'dept_id',fields:['dept_name','head_emp_id']},
  projects: {table:'PROJECT',key:'project_id',fields:['project_name','description','start_date','end_date','status','dept_id']},
};
async function prepare(resource,body,existing=null) {
  const config=configs[resource]; assertFields(body,config.fields);
  const all={...existing,...body}; const values={};
  for (const field of Object.keys(body)) {
    if (field.endsWith('_id')) values[field]=optionalId(body[field],field);
    else if (field.endsWith('_date')) values[field]=date(body[field],field);
    else if (field==='status') values[field]=enumValue(body[field],field,PROJECT_STATUSES,'planned');
    else values[field]=text(body[field],field,{required:field==='dept_name'||field==='project_name',max:field==='description'?10000:field==='dept_name'?100:150});
  }
  if (!existing) {
    const name=resource==='departments'?'dept_name':'project_name';
    values[name]=text(body[name],name,{required:true,max:resource==='departments'?100:150});
  }
  // A historical head may have resigned since this department was saved.
  // Preserve that existing link while editing other fields; any new head must
  // still be eligible for an assignment.
  if (values.head_emp_id && values.head_emp_id !== existing?.head_emp_id) await requireAvailableEmployee(values.head_emp_id);
  if (values.dept_id) await requireRecord('DEPARTMENT','dept_id',values.dept_id);
  if (resource==='projects') dateOrder(date(all.start_date,'start_date'),date(all.end_date,'end_date'));
  return values;
}
export function catalogCollection(resource) {
  const config=configs[resource];
  return apiHandler(async(req,res)=>{
    const session=await requireSession(req,res); if (!session) return;
    if(req.method==='GET') {
      let sql=resource==='departments'
        ? 'SELECT d.*,e.name AS head_name FROM DEPARTMENT d LEFT JOIN EMPLOYEE e ON e.emp_id=d.head_emp_id'
        : 'SELECT p.*,d.dept_name FROM PROJECT p LEFT JOIN DEPARTMENT d ON d.dept_id=p.dept_id';
      const params=[];
      if(session.user.role!=='admin') {
        if(resource==='departments') {sql+=' WHERE d.dept_id=(SELECT dept_id FROM EMPLOYEE WHERE emp_id=?)';params.push(session.user.empId);}
        else {sql+=' WHERE p.project_id IN (SELECT project_id FROM TASK WHERE assigned_to=?)';params.push(session.user.empId);}
      }
      sql+=resource==='departments'?' ORDER BY d.dept_name':' ORDER BY p.project_name';
      return res.status(200).json(await query(sql,params));
    }
    const admin=await requireRole(req,res,['admin']);if(!admin)return;
    const values=await prepare(resource,req.body);
    const id=await insertRecord(config.table,values);
    return res.status(201).json({[config.key]:id});
  },['GET','POST']);
}
export function catalogItem(resource) {
  const config=configs[resource];
  return apiHandler(async(req,res)=>{
    const session=await requireRole(req,res,['admin']);if(!session)return;
    const id=parseId(req.query.id);const existing=await requireRecord(config.table,config.key,id);
    if(req.method==='GET')return res.status(200).json(existing);
    if(req.method==='PUT') {
      await updateRecord(config.table,config.key,id,await prepare(resource,req.body,existing));
      return res.status(200).json({success:true});
    }
    await deleteWithoutHistory(config.table,config.key,id,
      resource==='departments'?'SELECT (SELECT COUNT(*) FROM EMPLOYEE WHERE dept_id=?)+(SELECT COUNT(*) FROM PROJECT WHERE dept_id=?) AS total':'SELECT COUNT(*) AS total FROM TASK WHERE project_id=?',
      resource==='departments'?[id,id]:[id],
      'This record is in use. Keep it to preserve related work history.');
    return res.status(204).end();
  },['GET','PUT','DELETE']);
}
