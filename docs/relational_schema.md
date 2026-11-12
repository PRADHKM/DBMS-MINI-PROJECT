# Workload Management System — Relational Schema

(M:N `EMPLOYEE–SKILL` relationship resolved into a junction table; every other
relationship maps to a foreign key on the "many" side. PK = primary key,
FK = foreign key.)

The conceptual ER model has two synchronized editable/rendered sheets:
`er_diagram_chen.drawio` / `.svg` and `er_diagram_chen_details.drawio` / `.svg`.
`relational_schema.drawio` / `.svg` contains the complete physical schema,
including the separate vector store and all thirteen MySQL foreign-key mappings.
Repeated entity boxes in the Chen sheets denote the same entity, not extra tables.
Every integer MySQL primary key is `AUTO_INCREMENT`. Empty constraint cells below
mean the column is nullable; they do not mean the database omits foreign keys.

### 1. DEPARTMENT
| Column | Type | Constraint |
|---|---|---|
| dept_id | INT | PK |
| dept_name | VARCHAR(100) | UNIQUE, NOT NULL |
| head_emp_id | INT | FK → EMPLOYEE(emp_id) |

### 2. EMPLOYEE
| Column | Type | Constraint |
|---|---|---|
| emp_id | INT | PK |
| name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(100) | UNIQUE, NOT NULL |
| phone | VARCHAR(15) | |
| designation | VARCHAR(100) | |
| dept_id | INT | FK → DEPARTMENT(dept_id) |
| manager_id | INT | FK → EMPLOYEE(emp_id) *(self-referencing)* |
| date_of_joining | DATE | NOT NULL |
| status | ENUM('active','resigned') | NOT NULL, DEFAULT 'active' |

### 3. USER_ACCOUNT *(login credentials + role-based access)*
| Column | Type | Constraint |
|---|---|---|
| user_id | INT | PK |
| emp_id | INT | UNIQUE, NOT NULL, FK → EMPLOYEE(emp_id) |
| username | VARCHAR(50) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL *(bcrypt — never plaintext)* |
| role | ENUM('admin','employee') | NOT NULL, DEFAULT 'employee' |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

### 4. SKILL
| Column | Type | Constraint |
|---|---|---|
| skill_id | INT | PK |
| skill_name | VARCHAR(100) | UNIQUE, NOT NULL |

### 5. EMPLOYEE_SKILL *(junction table for EMPLOYEE M:N SKILL)*
| Column | Type | Constraint |
|---|---|---|
| emp_id | INT | PK (composite), FK → EMPLOYEE(emp_id) |
| skill_id | INT | PK (composite), FK → SKILL(skill_id) |
| proficiency | ENUM('beginner','intermediate','advanced','expert') | Nullable, DEFAULT 'intermediate' |

### 6. PROJECT
| Column | Type | Constraint |
|---|---|---|
| project_id | INT | PK |
| project_name | VARCHAR(150) | NOT NULL |
| description | TEXT | |
| start_date | DATE | |
| end_date | DATE | |
| status | ENUM('planned','ongoing','completed','on_hold') | NOT NULL, DEFAULT 'planned' |
| dept_id | INT | FK → DEPARTMENT(dept_id) |

Table check: `end_date >= start_date` when both dates are supplied.

### 7. TASK
| Column | Type | Constraint |
|---|---|---|
| task_id | INT | PK |
| project_id | INT | NOT NULL, FK → PROJECT(project_id) |
| assigned_to | INT | FK → EMPLOYEE(emp_id) |
| title | VARCHAR(150) | NOT NULL |
| description | TEXT | |
| priority | ENUM('low','medium','high','critical') | NOT NULL, DEFAULT 'medium' |
| status | ENUM('not_started','in_progress','completed','blocked') | NOT NULL, DEFAULT 'not_started' |
| start_date | DATE | |
| due_date | DATE | |
| completion_date | DATE | |

Table check: `due_date >= start_date` when both dates are supplied. Triggers stamp
completion dates and clear them when a completed task is reopened.

### 8. WORK_LOG
| Column | Type | Constraint |
|---|---|---|
| log_id | INT | PK |
| task_id | INT | NOT NULL, FK → TASK(task_id) |
| emp_id | INT | NOT NULL, FK → EMPLOYEE(emp_id) |
| log_date | DATE | NOT NULL |
| hours_spent | DECIMAL(4,2) | NOT NULL, CHECK (hours_spent > 0 AND hours_spent <= 24) |
| notes | TEXT | |

### 9. RESIGNATION
| Column | Type | Constraint |
|---|---|---|
| resignation_id | INT | PK |
| emp_id | INT | UNIQUE, NOT NULL, FK → EMPLOYEE(emp_id) |
| resignation_date | DATE | NOT NULL |
| last_working_day | DATE | NOT NULL |
| handover_notes | TEXT | |
| handover_to | INT | FK → EMPLOYEE(emp_id) |

Table check: `last_working_day >= resignation_date`.

### Relationships, optionality and referential actions

| Referencing column | Referenced key | Cardinality and optionality | ON DELETE |
|---|---|---|---|
| DEPARTMENT.head_emp_id | EMPLOYEE.emp_id | Each department has 0..1 head; an employee may head 0..N departments | SET NULL |
| EMPLOYEE.dept_id | DEPARTMENT.dept_id | Employee belongs to 0..1 department; department has 0..N employees | SET NULL |
| EMPLOYEE.manager_id | EMPLOYEE.emp_id | Employee has 0..1 manager; manager has 0..N reports | SET NULL |
| USER_ACCOUNT.emp_id | EMPLOYEE.emp_id | Account has 1 employee; employee has 0..1 account (UNIQUE) | CASCADE |
| EMPLOYEE_SKILL.emp_id | EMPLOYEE.emp_id | Each junction row has 1 employee; employee has 0..N skill rows | CASCADE |
| EMPLOYEE_SKILL.skill_id | SKILL.skill_id | Each junction row has 1 skill; skill has 0..N employee rows | CASCADE |
| PROJECT.dept_id | DEPARTMENT.dept_id | Project has 0..1 department; department has 0..N projects | SET NULL |
| TASK.project_id | PROJECT.project_id | Task has 1 project; project has 0..N tasks | CASCADE |
| TASK.assigned_to | EMPLOYEE.emp_id | Task has 0..1 current assignee; employee has 0..N tasks | SET NULL |
| WORK_LOG.task_id | TASK.task_id | Log has 1 task; task has 0..N logs | CASCADE |
| WORK_LOG.emp_id | EMPLOYEE.emp_id | Log has 1 original author; employee has 0..N logs | CASCADE |
| RESIGNATION.emp_id | EMPLOYEE.emp_id | Notice has 1 departing employee; employee has 0..1 notice (UNIQUE) | CASCADE |
| RESIGNATION.handover_to | EMPLOYEE.emp_id | Notice has 0..1 successor; successor can receive 0..N notices | SET NULL |

All thirteen foreign keys use `ON UPDATE CASCADE`. Database cascades are the
physical rules; the API additionally rejects deletes that would erase retained
work or handover history. `head_emp_id` is not unique, so the head relationship
must not be drawn as one-to-one. Membership and department leadership are separate
relationships. The M:N employee/skill relationship has the attribute `proficiency`
and becomes the composite-key `EMPLOYEE_SKILL` table.

Indexes include `(emp_id, log_date)` on work logs and FULLTEXT indexes on work-log
notes and task title/description. Procedure/trigger checks add active assignment,
work-log ownership/date and resignation/handover rules. The API serializes daily
hour totals to enforce a maximum of 24 hours across all logs for one day; the row
CHECK alone enforces the per-entry bound.

---

## Vector database — PostgreSQL + pgvector (separate paradigm)

`ai_work_summaries` is **not** a MySQL table. It lives in a second database
(PostgreSQL with the `pgvector` extension) as an embeddings store, since
its purpose — semantic similarity search over generated summaries — is a
vector-search problem, not a relational one.

### ai_work_summaries (PostgreSQL / pgvector)
| Column | Type | Notes |
|---|---|---|
| summary_id | SERIAL | PK |
| emp_id | INTEGER | NOT NULL; logical reference to MySQL EMPLOYEE(emp_id) — not an enforced FK (cross-database) |
| generated_on | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| summary_text | TEXT | NOT NULL; record-based summary built from MySQL work records |
| source_context | VARCHAR(255) | Description of snapshot origin |
| embedding | VECTOR(1536) | Offline `local-hash-v1` embedding of `summary_text`; nullable |
| generation_method | VARCHAR(20) | NOT NULL, DEFAULT 'record'; application writes `record` (or `edited` after an admin edit) |
| source_fingerprint | CHAR(64) | SHA-256 fingerprint for stale-summary detection |
| embedding_model | VARCHAR(120) | Prevents mixing incompatible embedding models |
| source_log_ids | JSONB | NOT NULL, DEFAULT []; logical MySQL work-log evidence IDs |
| source_task_ids | JSONB | NOT NULL, DEFAULT []; logical MySQL assigned-task evidence IDs |

An HNSW index using `vector_cosine_ops` is defined for vector search. The
application ranks each employee's latest snapshot, filters by embedding model,
and excludes entries with no embedding. Full setup is in
`database/pgvector/01_setup.sql`; application queries are in `app/lib/pgvector.js`.
Source IDs are cross-engine logical references, not enforced foreign keys.

The store also indexes `emp_id` and `(emp_id, generated_on DESC, summary_id DESC)`
for snapshot lookup. `database/pgvector/02_crud_examples.sql` is a runnable,
rollback-only demonstration of actual reads, captured-ID updates/deletes and
cosine similarity. It uses a synthetic model excluded by application search;
it does not overwrite existing employee summaries.

### Date-effective employment

`v_employee_effective_status` derives departure after `last_working_day` while
preserving the stored employee and resignation records. Notice immediately
transfers open assignments; access remains active through the last working day.
Historical log authors stay unchanged. The API rejects destructive deletes that
would erase retained contribution or handover history.

---
**Normalization note:** all MySQL tables are in 3NF — no repeating groups
(1NF), every non-key attribute depends on the whole key (2NF, relevant
mainly to the composite-key EMPLOYEE_SKILL table), and no non-key attribute
depends on another non-key attribute (3NF) — e.g. `dept_name` isn't
duplicated on EMPLOYEE, only `dept_id` is stored there. The vector store is
intentionally denormalized (one row per summary with an embedded vector),
which is standard practice for vector databases — normalization rules
don't apply the same way there.
