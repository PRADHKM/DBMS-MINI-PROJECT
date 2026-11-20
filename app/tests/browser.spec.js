const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const password = process.env.WMS_TEST_PASSWORD || 'Passw0rd!';
const screenshots = process.env.WMS_SCREENSHOT_DIR || path.resolve(__dirname, '../../docs/screenshots');

function observeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|server responded with a status|net::ERR_/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}
async function login(page, username) {
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('admin can inspect each workflow and generate a contribution summary', async ({ page }) => {
  const errors = observeErrors(page);
  await login(page, process.env.WMS_TEST_ADMIN || 'ravi.shankar');
  await expect(page.getByRole('heading', { name: 'Team overview', exact: true })).toBeVisible();
  await expect(page.locator('tbody')).toContainText('Ravi Shankar');
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);
  await fs.mkdir(screenshots, { recursive: true });
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/employees?') && response.url().includes('dept=1') && response.status() === 200),
    page.getByRole('combobox', { name: 'Department', exact: true }).selectOption({ label: 'Engineering' }),
  ]);
  await expect(page.locator('tbody')).not.toContainText('Integration');
  await expect(page.locator('tbody')).toContainText('Ravi Shankar');
  await expect(page.locator('.stat strong').first()).not.toHaveText('—');
  await page.screenshot({ path: path.join(screenshots, 'dashboard-preview.png'), fullPage: true });

  await page.getByRole('link', { name: 'People & projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People & projects', exact: true })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await page.getByRole('button', { name: 'Departments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Departments', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Engineering', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByLabel(/^Project name/)).toBeVisible();
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Team tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create a task', exact: true })).toBeVisible();
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Work logs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Team work history', exact: true })).toBeVisible();
  await expect(page.getByLabel('Hours spent')).toBeVisible();
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Handover', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Employee handover', exact: true })).toBeVisible();
  await expect(page.getByLabel('Departing employee')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Handover history', exact: true })).toBeVisible();
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);

  await page.goto('/employees/2');
  await expect(page.getByRole('heading', { name: 'Ananya Rao', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent work logs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^(Generate|Regenerate) summary$/ }).click();
  await expect(page.getByRole('button', { name: /^(Generate|Regenerate) summary$/ })).toBeEnabled({ timeout: 30000 });
  const summary = page.locator('.summary-text');
  if (await summary.count()) {
    await expect(summary).not.toBeEmpty();
    await expect(page.getByRole('heading', { name: /Record-based summary|AI work summary/ })).toBeVisible();
  } else {
    // A missing vector database/provider is an actionable inline error, never a broken page.
    await expect(page.locator('.summary-card').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assigned tasks', exact: true })).toBeVisible();
  }
  await page.screenshot({ path: path.join(screenshots, 'employee-profile-preview.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('employee sees only their records and cannot open admin pages or other profiles', async ({ page }) => {
  const errors = observeErrors(page);
  await login(page, process.env.WMS_TEST_EMPLOYEE || 'ananya.rao');
  await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'People & projects', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Handover', exact: true })).toHaveCount(0);
  await expect(page.getByText('Ravi Shankar', { exact: true })).toHaveCount(0);
  const ownRows = page.locator('tbody tr');
  await expect(ownRows).toHaveCount(1);
  await expect(ownRows.first()).toContainText('Ananya Rao');
  for (const url of ['/manage', '/handover', '/employees/1']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create a task', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Work logs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your work history', exact: true })).toBeVisible();
  await expect(page.getByLabel('Employee', { exact: true })).toHaveCount(0);
  const forbidden = await page.request.get('/api/employees/1');
  expect(forbidden.status()).toBe(403);
  const adminWrite = await page.request.post('/api/departments', { data: { dept_name: 'Forbidden department' } });
  expect(adminWrite.status()).toBe(403);
  expect(errors).toEqual([]);
});

test('HR employee requests resignation and an admin approves their frontend successor', async ({ page, browser, baseURL }) => {
  const errors = observeErrors(page);
  await login(page, process.env.WMS_TEST_ADMIN || 'ravi.shankar');
  const options = await (await page.request.get('/api/options')).json();
  const name = `Browser HR ${Date.now()}`;
  const username = name.replaceAll(' ', '.').toLowerCase();
  const employeeResponse = await page.request.post('/api/employees', { data: {
    name, email: `${name.replaceAll(' ', '-')}@example.test`, date_of_joining: '2020-01-01', dept_id: 3, designation: 'HR Executive',
    username, password,
  } });
  expect(employeeResponse.status()).toBe(201);
  const { emp_id } = await employeeResponse.json();
  const taskResponse = await page.request.post('/api/tasks', { data: {
    project_id: 1, assigned_to: emp_id, title: `Handover from ${name}`,
  } });
  expect(taskResponse.status()).toBe(201);
  const { task_id } = await taskResponse.json();
  const employeeContext = await browser.newContext({ baseURL });
  const applicant = await employeeContext.newPage();
  const applicantErrors = observeErrors(applicant);
  try {
    await login(applicant, username);
    await applicant.getByRole('link', { name: 'Resignation', exact: true }).click();
    await expect(applicant.getByLabel(/^Proposed last working day/)).toHaveValue(options.today);
    await applicant.getByLabel('Notes for the admin').fill('Please arrange a successor for my open work.');
    await applicant.getByRole('button', { name: 'Submit request' }).click();
    await expect(applicant.getByRole('row').filter({ hasText: /pending/i })).toBeVisible();

    await page.goto('/handover');
    const pendingRow = page.getByRole('row').filter({ hasText: name });
    await expect(pendingRow).toContainText('Please arrange a successor for my open work.');
    await pendingRow.getByRole('button', { name: 'Review request' }).click();
    await expect(page.getByLabel(/^Resignation date/)).toHaveValue(options.today);
    await expect(page.getByLabel(/^Last working day/)).toHaveValue(options.today);
    await expect(page.getByLabel(/^Departing employee/)).toHaveValue(String(emp_id));
    await expect(page.getByRole('group', { name: 'Selected departing employee' })).toContainText('Domains: HR Executive');
    await expect(page.getByRole('group', { name: 'Selected departing employee' })).toContainText('Department: HR');
    await page.getByLabel(/^Handover to/).selectOption('4');
    const successorDetails = page.getByRole('group', { name: 'Selected successor' });
    await expect(successorDetails).toContainText('Domains: Frontend Engineer');
    await expect(successorDetails).toContainText('React (expert)');
    await page.getByLabel(/^Handover to/).selectOption('11');
    await expect(successorDetails).toContainText('Domains: Backend Engineer');
    await expect(successorDetails).not.toContainText('Frontend Engineer');
    await page.getByLabel(/^Handover to/).selectOption('4');
    await page.getByRole('button', { name: /Review handover/ }).click();
    const review = page.locator('.review-panel');
    await expect(review).toContainText('Department: HR');
    await expect(review).toContainText('HR Executive');
    await expect(review).toContainText('Department: Engineering');
    await expect(review).toContainText('Frontend Engineer');
    await expect(review).toContainText('React (expert)');
    await page.getByRole('button', { name: 'Approve resignation' }).click();

    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });
    await expect(row.getByRole('cell').nth(0)).toContainText('Department: HR');
    await expect(row.getByRole('cell').nth(1)).toContainText('React (expert)');
    await expect(row).toContainText('On notice');
    const moved = await (await page.request.get(`/api/tasks/${task_id}`)).json();
    expect(moved.assigned_to).toBe(4);
    await page.goto('/employees/4');
    const domains = page.getByRole('region', { name: 'Domains and skills' });
    await expect(domains).toContainText('Frontend Engineer');
    await expect(domains).toContainText('HR Executive');
    await expect(domains).toContainText(`Inherited from ${name}'s handover`);
    await page.goto('/handover');
    await page.getByLabel(/^Departing employee/).selectOption('4');
    const inheritedDetails = page.getByRole('group', { name: 'Selected departing employee' });
    await expect(inheritedDetails).toContainText('Frontend Engineer');
    await expect(inheritedDetails).toContainText('HR Executive');
    await applicant.getByRole('button', { name: 'Refresh status' }).click();
    const approvedRow = applicant.getByRole('row').filter({
      has: applicant.getByRole('cell', { name: /^approved$/i }),
    });
    await expect(approvedRow).toContainText('Divya Menon');
    await page.goto(`/employees/${emp_id}`);
    await expect(page.locator('.profile-overview .pill')).toHaveText('On notice');
    await expect(page.getByRole('link', { name: /Start a handover/ })).toHaveCount(0);
    await page.goto('/dashboard');
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('On notice');
  } finally {
    await employeeContext.close();
    await page.request.delete(`/api/tasks/${task_id}`);
  }
  expect(errors).toEqual([]);
  expect(applicantErrors).toEqual([]);
});

test('mobile login and authenticated workspace fit without horizontal overflow', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, process.env.WMS_TEST_EMPLOYEE || 'ananya.rao');
  await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Ananya Rao', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  expect(errors).toEqual([]);
});

test('editing historical assignees, managers and department heads preserves their visible owner', async ({ page }) => {
  const errors = observeErrors(page);
  await login(page, process.env.WMS_TEST_ADMIN || 'ravi.shankar');
  const taskResponse = await page.request.get('/api/tasks/4');
  expect(taskResponse.ok()).toBe(true);
  const task = await taskResponse.json();
  const revisedTitle = `${task.title} — retention check`;
  try {
    await page.goto('/tasks');
    const row = page.locator('tbody tr').filter({ has: page.getByText(task.title, { exact: true }) });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const assignee = page.getByLabel(/^Assigned employee/);
    await expect(assignee).toHaveValue(String(task.assigned_to));
    await expect(assignee.locator('option:checked')).toContainText('Suresh Pillai (current assignee)');
    await page.getByLabel(/^Task title/).fill(revisedTitle);
    const [updated] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/tasks/4') && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Save task', exact: true }).click(),
    ]);
    expect(updated.status()).toBe(200);
    const persisted = await (await page.request.get('/api/tasks/4')).json();
    expect(persisted.title).toBe(revisedTitle);
    expect(persisted.assigned_to).toBe(task.assigned_to);
  } finally {
    const restored = await page.request.put('/api/tasks/4', { data: { title: task.title } });
    expect(restored.ok()).toBe(true);
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  async function create(resource, data) {
    const response = await page.request.post(`/api/${resource}`, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const head = await create('employees', { name: `Browser retention head ${suffix}`, email: `head-${suffix}@example.test`, date_of_joining: '2020-01-01' });
  const report = await create('employees', { name: `Browser retention report ${suffix}`, email: `report-${suffix}@example.test`, date_of_joining: '2021-01-01', manager_id: head.emp_id });
  const departmentName = `Browser retention ${suffix}`;
  const department = await create('departments', { dept_name: departmentName, head_emp_id: head.emp_id });
  const { today } = await (await page.request.get('/api/options')).json();
  const departureDate = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const resignation = await page.request.post('/api/resignations', { data: { emp_id: head.emp_id, handover_to: 1, resignation_date: departureDate, last_working_day: departureDate, handover_notes: 'Browser regression: retain existing manager/head references.' } });
  expect(resignation.ok(), await resignation.text()).toBe(true);
  try {
    await page.goto('/manage');
    const reportRow = page.locator('tbody tr').filter({ has: page.getByText(`Browser retention report ${suffix}`, { exact: true }) });
    await reportRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const manager = page.getByRole('combobox', { name: 'Manager', exact: true });
    await expect(manager).toHaveValue(String(head.emp_id));
    await expect(manager.locator('option:checked')).toContainText('(current manager)');
    await page.getByLabel('Designation', { exact: true }).fill('Retention regression');
    const [updatedReport] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/employees/${report.emp_id}`) && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Save changes', exact: true }).click(),
    ]);
    expect(updatedReport.status()).toBe(200);
    const savedReport = await (await page.request.get(`/api/employees/${report.emp_id}`)).json();
    expect(savedReport.employee.manager_id).toBe(head.emp_id);

    await page.getByRole('button', { name: 'Departments', exact: true }).click();
    const departmentRow = page.locator('tbody tr').filter({ has: page.getByText(departmentName, { exact: true }) });
    await departmentRow.getByRole('button', { name: 'Edit', exact: true }).click();
    const departmentHead = page.getByRole('combobox', { name: 'Department head', exact: true });
    await expect(departmentHead).toHaveValue(String(head.emp_id));
    await expect(departmentHead.locator('option:checked')).toContainText('(current head)');
    await page.getByLabel(/^Department name/).fill(`${departmentName} renamed`);
    const [renamed] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/departments/${department.dept_id}`) && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Save changes', exact: true }).click(),
    ]);
    expect(renamed.status()).toBe(200);
    const savedDepartment = await (await page.request.get(`/api/departments/${department.dept_id}`)).json();
    expect(savedDepartment.head_emp_id).toBe(head.emp_id);
    expect(savedDepartment.dept_name).toBe(`${departmentName} renamed`);
  } finally {
    // Only disposable fixtures without history can be removed. The resignation is deliberately retained.
    await page.request.delete(`/api/employees/${report.emp_id}`);
    await page.request.delete(`/api/departments/${department.dept_id}`);
  }
  expect(errors).toEqual([]);
});

test('admin can search, edit (re-embed) and delete vector summaries from the UI', async ({ page }) => {
  const errors = observeErrors(page);
  const word = 'zebraquartz' + Date.now().toString(36);
  page.on('dialog', dialog => dialog.accept());
  await login(page, process.env.WMS_TEST_ADMIN || 'ravi.shankar');
  await page.goto('/employees/2');
  await page.getByRole('button', { name: /^(Generate|Regenerate) summary$/ }).click();
  await expect(page.getByRole('button', { name: /^(Generate|Regenerate) summary$/ })).toBeEnabled({ timeout: 30000 });
  const history = page.locator('#summary-history');
  await expect(history.getByRole('heading', { name: 'Saved summary snapshots' })).toBeVisible();
  await expect(history.locator('tbody tr').first()).toContainText(/local-hash-v1|text-embedding/);

  // SEARCH finds the freshly embedded summary.
  await page.goto('/dashboard');
  await page.getByLabel('Search team knowledge').fill('Ananya Rao senior backend engineer');
  await page.getByRole('button', { name: 'Search knowledge' }).click();
  await expect(page.locator('.search-results article').first()).toContainText('Ananya Rao');

  // UPDATE: edit text, which re-embeds; the new unique word becomes searchable.
  await page.goto('/employees/2');
  await history.locator('tbody tr').first().getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit summary text').fill(`Ananya Rao led the ${word} rollout.`);
  await page.getByRole('button', { name: 'Save and re-embed' }).click();
  await expect(page.getByText('Summary updated and re-embedded.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Edited work summary' })).toBeVisible();
  await page.goto('/dashboard');
  await page.getByLabel('Search team knowledge').fill(`${word} rollout`);
  await page.getByRole('button', { name: 'Search knowledge' }).click();
  await expect(page.locator('.search-results article').first()).toContainText(word);

  // DELETE removes the vector, so the unique word is no longer found.
  await page.goto('/employees/2');
  await history.locator('tbody tr').first().getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Summary snapshot deleted.')).toBeVisible();
  await page.goto('/dashboard');
  await page.getByLabel('Search team knowledge').fill(`${word} rollout`);
  await page.getByRole('button', { name: 'Search knowledge' }).click();
  await expect(page.locator('.search-results')).not.toContainText(word);
  expect(errors).toEqual([]);
});

test('employee sees own snapshots read-only and no search panel', async ({ page }) => {
  await login(page, 'ananya.rao');
  await page.goto('/employees/2');
  await expect(page.locator('#summary-history')).toBeVisible();
  await expect(page.locator('#summary-history').getByRole('button', { name: /^(Edit|Delete)$/ })).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.getByLabel('Search team knowledge')).toHaveCount(0);
});
