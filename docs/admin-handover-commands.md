# Admin resignation and handover commands

For MySQL-only commands, run `SOURCE database/mysql/11_admin_handover_demo.sql;` from the MySQL prompt with the repository as your working directory. That file includes the employee setup, trigger inspection, resignation procedure and before-and-after checks.

Run the PowerShell blocks in order in the same terminal. This example creates an HR employee, a new frontend successor, and sample work so you can inspect the complete handover. Use your running local app. The existing employee accounts are listed in **People & projects** if you want to repeat the steps with your own selections.

The admin can record a resignation from **Handover → Start a handover**. Choose the departing employee, successor, dates and notes, then review and confirm. For employees with open tasks, confirmation records the resignation and transfers the tasks together. Assigning the successor in a separate operation after recording that resignation would require an additional workflow.

## 1. Sign in as admin

```powershell
Set-Location 'C:\Users\maruthi Prasad\Documents\Codex\2026-11-13\https-github-com-pradhkm-dbms-mini\work\DBMS-MINI-PROJECT'
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:33113'

# Authenticate the terminal session with the same admin account used in the browser.
$csrf = Invoke-RestMethod "$base/api/auth/csrf" -SessionVariable session
$login = @{
    csrfToken = $csrf.csrfToken
    username = 'ravi.shankar'
    password = 'Passw0rd!'
    json = 'true'
    callbackUrl = "$base/dashboard"
}
$null = Invoke-RestMethod "$base/api/auth/callback/credentials" -WebSession $session -Method Post -Body $login -ContentType 'application/x-www-form-urlencoded'
$account = Invoke-RestMethod "$base/api/auth/session" -WebSession $session
if ($account.user.role -ne 'admin') { throw 'Sign in with an admin account first.' }
$account.user | Format-List name, role, empId | Out-Host
```

## 2. Create a departing HR employee and a new successor

The two new demo accounts have distinct usernames and the local demo password `Passw0rd!`. The HR employee starts with an unfinished task, a completed task and a work log.

```powershell
# Read the same calendar and reference data that the app uses.
$options = Invoke-RestMethod "$base/api/options" -WebSession $session
$today = $options.today
$lastDay = (Get-Date $today).AddDays(7).ToString('yyyy-MM-dd')
$hr = $options.departments | Where-Object dept_name -eq 'HR'
$engineering = $options.departments | Where-Object dept_name -eq 'Engineering'
$project = $options.projects | Select-Object -First 1
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)

# Create the departing employee. Keep the returned ID for the later commands.
$departingBody = @{
    name = "Admin Demo HR $tag"
    email = "admin-demo-hr-$tag@example.test"
    designation = 'HR Executive'
    dept_id = $hr.dept_id
    date_of_joining = $today
    username = "admin.demo.hr.$tag"
    password = 'Passw0rd!'
    role = 'employee'
} | ConvertTo-Json
$departing = Invoke-RestMethod "$base/api/employees" -WebSession $session -Method Post -ContentType 'application/json' -Body $departingBody

# Create a new employee who will receive the open work.
$successorBody = @{
    name = "Admin Demo Frontend $tag"
    email = "admin-demo-frontend-$tag@example.test"
    designation = 'Frontend Engineer'
    dept_id = $engineering.dept_id
    date_of_joining = $today
    username = "admin.demo.frontend.$tag"
    password = 'Passw0rd!'
    role = 'employee'
} | ConvertTo-Json
$successor = Invoke-RestMethod "$base/api/employees" -WebSession $session -Method Post -ContentType 'application/json' -Body $successorBody

# Add one open task.
$taskBody = @{
    project_id = $project.project_id
    assigned_to = $departing.emp_id
    title = "Admin demo handover $tag"
    status = 'in_progress'
} | ConvertTo-Json
$task = Invoke-RestMethod "$base/api/tasks" -WebSession $session -Method Post -ContentType 'application/json' -Body $taskBody

# Add work history before handing the task over.
$logBody = @{
    task_id = $task.task_id
    emp_id = $departing.emp_id
    log_date = $today
    hours_spent = 2
    notes = 'Prepared the HR handover and documented the outstanding work.'
} | ConvertTo-Json
$log = Invoke-RestMethod "$base/api/worklogs" -WebSession $session -Method Post -ContentType 'application/json' -Body $logBody

# Add a completed task to compare with the unfinished task.
$completedBody = @{
    project_id = $project.project_id
    assigned_to = $departing.emp_id
    title = "Admin demo finished work $tag"
    status = 'completed'
} | ConvertTo-Json
$completed = Invoke-RestMethod "$base/api/tasks" -WebSession $session -Method Post -ContentType 'application/json' -Body $completedBody

Write-Output "Departing employee ID = $($departing.emp_id)"
Write-Output "New successor ID = $($successor.emp_id)"
Write-Output "Open task ID = $($task.task_id)"
Write-Output "Historical work log ID = $($log.log_id)"
```

## 3. Check before the resignation

```powershell
# BEFORE. Employee status should be active.
$before = Invoke-RestMethod "$base/api/employees/$($departing.emp_id)" -WebSession $session
$before.employee | Format-List emp_id, name, dept_name, designation, status | Out-Host

# Both task owners and the work log author should be the departing employee's ID.
Invoke-RestMethod "$base/api/tasks/$($task.task_id)" -WebSession $session | Format-List task_id, title, status, assigned_to | Out-Host
Invoke-RestMethod "$base/api/tasks/$($completed.task_id)" -WebSession $session | Format-List task_id, title, status, assigned_to | Out-Host
Invoke-RestMethod "$base/api/worklogs/$($log.log_id)" -WebSession $session | Format-List log_id, emp_id, hours_spent, notes | Out-Host
```

## 4. Record the resignation as admin

This command performs the same direct admin operation as **Confirm handover** in the browser. You can instead confirm through the browser and then continue with section 5. Run this operation once for each departing employee.

```powershell
# CHANGE. Record the resignation and transfer unfinished tasks to the new employee.
$resignation = @{
    emp_id = $departing.emp_id
    resignation_date = $today
    last_working_day = $lastDay
    handover_to = $successor.emp_id
    handover_notes = 'New frontend employee receives the outstanding work. Original work history is retained.'
} | ConvertTo-Json
Invoke-RestMethod "$base/api/resignations" -WebSession $session -Method Post -ContentType 'application/json' -Body $resignation | Format-List success, message | Out-Host
```

## 5. Check after the handover

```powershell
# AFTER. Status should be notice_period through the last working day.
$after = Invoke-RestMethod "$base/api/employees/$($departing.emp_id)" -WebSession $session
$after.employee | Format-List emp_id, name, dept_name, designation, status, last_working_day | Out-Host

# The open task should now belong to the new employee.
$moved = Invoke-RestMethod "$base/api/tasks/$($task.task_id)" -WebSession $session
$moved | Format-List task_id, title, status, assigned_to | Out-Host
if ($moved.assigned_to -ne $successor.emp_id) { throw 'The open task did not reach the successor.' }

# The completed task and work log should retain the original employee.
$finished = Invoke-RestMethod "$base/api/tasks/$($completed.task_id)" -WebSession $session
$history = Invoke-RestMethod "$base/api/worklogs/$($log.log_id)" -WebSession $session
$finished | Format-List task_id, title, status, assigned_to | Out-Host
$history | Format-List log_id, emp_id, hours_spent, notes | Out-Host
if ($finished.assigned_to -ne $departing.emp_id -or $history.emp_id -ne $departing.emp_id) {
    throw 'The original work history was changed.'
}

# Show the domain, department, dates, notes and successor recorded in the handover.
$handovers = Invoke-RestMethod "$base/api/resignations" -WebSession $session
$handover = $handovers | Where-Object emp_id -eq $departing.emp_id
$handover | Format-List employee_name, employee_department, employee_designation, status, resignation_date, last_working_day, handover_name, successor_department, successor_designation, handover_notes | Out-Host
$handover.employee_skills | Format-Table name, proficiency | Out-Host
$handover.successor_skills | Format-Table name, proficiency | Out-Host

# Show a fresh contribution summary with the preserved log as a source.
Invoke-RestMethod "$base/api/employees/$($departing.emp_id)/summary" -WebSession $session -Method Post | Format-List summary_text, source_log_ids, source_task_ids | Out-Host

# Print all current handovers from the same MySQL database as the app.
npm --prefix app run handover
```

The demo employees initially have no skill records, so those two skill lists are empty. For employees with saved skills, the same commands display their respective lists. Starting the day after the last working day, the employee's employment status becomes `resigned` and sign-in is refused.
