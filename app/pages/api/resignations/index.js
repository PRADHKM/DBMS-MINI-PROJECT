import { query } from '../../../lib/mysql';
import { requireRole } from '../../../lib/auth';
import { apiHandler, parseId, optionalId, date, text, dateOrder, assertFields, fail } from '../../../lib/api';

export default apiHandler(async(req,res)=>{
  const session=await requireRole(req,res,['admin']);if(!session)return;
  if(req.method==='GET')return res.status(200).json(await query(`SELECT r.*,e.name AS employee_name,h.name AS handover_name,
    CASE WHEN r.last_working_day<CURDATE() THEN 'resigned' ELSE 'notice_period' END AS status
    FROM RESIGNATION r JOIN EMPLOYEE e ON e.emp_id=r.emp_id LEFT JOIN EMPLOYEE h ON h.emp_id=r.handover_to ORDER BY r.resignation_date DESC`));
  assertFields(req.body,['emp_id','resignation_date','last_working_day','handover_notes','handover_to']);
  const body=req.body;
  const id=parseId(body.emp_id,'emp_id'),recipient=optionalId(body.handover_to,'handover_to');
  const resignation=date(body.resignation_date,'resignation_date',{required:true}),last=date(body.last_working_day,'last_working_day',{required:true});
  dateOrder(resignation,last,'resignation_date','last_working_day');
  if(id===recipient)fail(400,'Choose a different employee for handover');
  await query('CALL sp_process_resignation(?,?,?,?,?)',[id,resignation,last,text(body.handover_notes,'handover_notes'),recipient]);
  return res.status(201).json({success:true,message:'Resignation recorded and unfinished tasks handed over. Account access ends after the last working day.'});
},['GET','POST']);
