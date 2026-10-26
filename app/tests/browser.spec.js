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
  const departureDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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
