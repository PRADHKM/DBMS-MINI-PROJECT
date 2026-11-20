export function domainNames(employee) {
  const domains = employee.domains?.length ? employee.domains : [employee];
  return [...new Set(domains
    .map(domain => domain.designation || domain.dept_name)
    .filter(Boolean))];
}
