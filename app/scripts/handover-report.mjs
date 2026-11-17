import mysql from 'mysql2/promise';

const label = { active: 'Active', notice_period: 'On notice', resigned: 'Resigned' };
function printEmployee(title, name, department, role, skills) {
  console.log(`  ${title}: ${name || 'None'}`);
  if (!name) return;
  console.log(`    Department: ${department || 'Unassigned'} | Role: ${role || 'Unspecified'}`);
  console.log(`    Skills: ${skills.map(skill => `${skill.name} (${skill.proficiency})`).sort().join(', ') || 'None recorded'}`);
}

let db;
try {
  db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    dateStrings: true,
  });
  const [[clock]] = await db.query('SELECT CURDATE() AS today, @@session.time_zone AS time_zone');
  const [rows] = await db.query('SELECT * FROM v_resignation_handover ORDER BY resignation_date DESC, resignation_id DESC');
  console.log(`MySQL date: ${clock.today} (time zone: ${clock.time_zone})`);
  if (!rows.length) console.log('No handovers recorded.');
  for (const r of rows) {
    console.log(`\n#${r.resignation_id} — ${label[r.employment_status]} | Notice: ${r.resignation_date} | Last working day: ${r.last_working_day}`);
    printEmployee('Departing employee', r.resigning_employee, r.employee_department, r.designation, r.employee_skills);
    printEmployee('Successor', r.handover_to, r.successor_department, r.successor_designation, r.successor_skills);
  }
} catch (error) {
  console.error(`Could not read handover history: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) await db.end();
}
