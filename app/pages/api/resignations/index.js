import { query } from '../../../lib/mysql';
import { requireRole } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, date, text, dateOrder, assertFields, fail } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireRole(req,res,['admin']);if(!session)return;
  if(req.method==='GET')return res.status(200).json(await query(`SELECT resignation_id,emp_id,
    resigning_employee AS employee_name,designation AS employee_designation,employee_department,employee_skills,
    resignation_date,last_working_day,successor_emp_id AS handover_to,handover_to AS handover_name,
    successor_designation,successor_department,successor_skills,handover_notes,employment_status AS status
    FROM v_resignation_handover ORDER BY resignation_date DESC,resignation_id DESC`));
  assertFields(req.body,['emp_id','resignation_date','last_working_day','handover_notes','handover_to']);
  const body=req.body;
  const id=parseId(body.emp_id,'emp_id'),recipient=optionalId(body.handover_to,'handover_to');
  const resignation=date(body.resignation_date,'resignation_date',{required:true}),last=date(body.last_working_day,'last_working_day',{required:true});
  dateOrder(resignation,last,'resignation_date','last_working_day');
  if(id===recipient)fail(400,'Choose a different employee for handover');
  await query('CALL sp_process_resignation(?,?,?,?,?)',[id,resignation,last,text(body.handover_notes,'handover_notes'),recipient]);
  return res.status(201).json({success:true,message:'Resignation recorded. Account access ends after the last working day.'});
},['GET','POST']);
