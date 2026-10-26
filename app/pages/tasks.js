import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { requirePage } from "../components/server";
import { api, Layout, Field, Alert, Empty, Pill, Table, DeleteButton, human, date } from "../components/ui";
const statuses = ["not_started", "in_progress", "blocked", "completed"];
const fields = [{ name: "title", label: "Task title", required: true }, { name: "project_id", label: "Project", type: "select", required: true }, { name: "assigned_to", label: "Assigned employee", type: "select" }, { name: "priority", label: "Priority", type: "select", required: true }, { name: "status", label: "Status", type: "select", required: true }, { name: "start_date", label: "Start date", type: "date" }, { name: "due_date", label: "Due date", type: "date" }, { name: "description", label: "Description", type: "textarea", wide: true }];
const blank = { priority: "medium", status: "not_started" };
export default function Tasks() {
  const { data: session } = useSession(); const admin = session?.user?.role === "admin";
  const [records, setRecords] = useState([]); const [options, setOptions] = useState({ employees: [], projects: [] });
  const [form, setForm] = useState(blank); const [editing, setEditing] = useState(null); const [editingRecord, setEditingRecord] = useState(null); const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  async function load() { const [rows, opts] = await Promise.all([api("/api/tasks"), api("/api/options")]); setRecords(rows); setOptions(opts); }
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  function choices(field) {
    if (field.name === "project_id") return options.projects.map(p => ({ value: p.project_id, label: p.project_name }));
    if (field.name === "assigned_to") {
      const choices = options.employees.map(e => ({ value: e.emp_id, label: e.name }));
      const originalId = editingRecord?.assigned_to;
      if (editing && originalId && !choices.some(option => String(option.value) === String(originalId))) {
        choices.push({ value: originalId, label: `${editingRecord.assignee || `Employee #${originalId}`} (current assignee)` });
      }
      return choices;
    }
    return (field.name === "status" ? statuses : ["low", "medium", "high", "critical"]).map(value => ({ value, label: human(value) }));
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const payload = Object.fromEntries(fields.map(f => [f.name, form[f.name] || null])); await api(`/api/tasks${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }); setEditing(null); setForm(blank); await load(); setMessage("Task saved."); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function statusUpdate(record, status) {
    setBusy(true); setError(""); setMessage("");
    try { await api(`/api/tasks/${record.task_id}`, { method: "PUT", body: JSON.stringify({ status }) }); await load(); setMessage("Task status updated."); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(record) { setError(""); setMessage(""); try { await api(`/api/tasks/${record.task_id}`, { method: "DELETE" }); await load(); if (editing === record.task_id) { setEditing(null); setForm(blank); } setMessage("Task deleted."); } catch (e) { setError(e.message); } }
  function edit(record) { setEditing(record.task_id); setEditingRecord(record); setForm(Object.fromEntries(fields.map(f => [f.name, record[f.name] || ""]))); document.getElementById("task-form")?.scrollIntoView({ behavior: "smooth" }); }
  const rows = records.filter(t => !filter || t.status === filter);
  return <Layout title={admin ? "Team tasks" : "Your tasks"} subtitle={admin ? "Give every piece of work a clear owner and next step." : "Track your assignments and keep their progress up to date."}><Alert>{error}</Alert><Alert success>{message}</Alert>
    {admin && <section className="card" id="task-form"><div className="section-heading"><h2>{editing ? "Edit task" : "Create a task"}</h2>{editing && <button className="secondary" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}</div><form onSubmit={save}><div className="form-grid">{fields.map(field => <Field key={field.name} field={field} value={form[field.name]} options={choices(field)} onChange={value => setForm({ ...form, [field.name]: value })} />)}</div><div className="form-footer"><small>Work logs preserve the contributions behind each task.</small><button disabled={busy}>{busy ? "Saving…" : editing ? "Save task" : "Create task"}</button></div></form></section>}
    <section className="card"><div className="section-heading"><h2>{admin ? "Assignments" : "Assigned to you"}</h2><label><span className="sr-only">Filter by status</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{statuses.map(s => <option key={s} value={s}>{human(s)}</option>)}</select></label></div>{loading ? <Empty>Loading assignments…</Empty> : rows.length ? <Table><thead><tr><th>Task</th><th>Owner</th><th>Priority</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(t => <tr key={t.task_id}><td><strong>{t.title}</strong><span className="cell-subtitle">{t.project_name}</span></td><td>{t.assignee || "Unassigned"}</td><td><Pill value={t.priority} /></td><td>{date(t.due_date)}</td><td><Pill value={t.status} /></td><td>{admin ? <div className="row-actions"><button className="text-button" onClick={() => edit(t)}>Edit</button><DeleteButton onDelete={() => remove(t)} label={`Delete ${t.title}`} /></div> : <select aria-label={`Update status for ${t.title}`} value={t.status} disabled={busy} onChange={e => statusUpdate(t, e.target.value)}>{statuses.map(s => <option key={s} value={s}>{human(s)}</option>)}</select>}</td></tr>)}</tbody></Table> : <Empty>No tasks match this view.</Empty>}</section>
  </Layout>;
}
export async function getServerSideProps(context) { return requirePage(context); }
