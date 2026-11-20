import { query } from './mysql';

export async function loadEmployeeDomains(employeeIds) {
  const ids = [...new Set(employeeIds)];
  const byEmployee = new Map(ids.map(id => [id, []]));
  if (!ids.length) return byEmployee;
  const rows = await query(`SELECT emp_id, source_emp_id, source_name, designation,
      dept_name, skills, inherited FROM v_employee_domains
    WHERE emp_id IN (${ids.map(() => '?').join(',')})
    ORDER BY emp_id, inherited, source_name, source_emp_id`, ids);
  for (const { emp_id, inherited, ...domain } of rows) {
    byEmployee.get(emp_id).push({ ...domain, inherited: Boolean(inherited) });
  }
  return byEmployee;
}

export async function withEmployeeDomains(employees) {
  const domains = await loadEmployeeDomains(employees.map(employee => employee.emp_id));
  return employees.map(employee => ({ ...employee, domains: domains.get(employee.emp_id) }));
}
