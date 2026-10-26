import { useEffect, useState } from "react";
import { requirePage } from "../components/server";
import { api, Layout, Field, Alert, Empty, Pill, Table, DeleteButton, human, date } from "../components/ui";

const definitions = {
  employees: { label: "Employees", singular: "employee", key: "emp_id", fields: [
    { name: "name", label: "Full name", required: true, maxLength: 100 }, { name: "email", label: "Email address", type: "email", required: true, maxLength: 100 },
    { name: "designation", label: "Designation", maxLength: 100 }, { name: "phone", label: "Phone", maxLength: 15 }, { name: "dept_id", label: "Department", type: "select" }, { name: "manager_id", label: "Manager", type: "select" }, { name: "date_of_joining", label: "Joining date", type: "date", required: true },
    { name: "username", label: "Login username", maxLength: 50, createOnly: true, help: "Optional. Add a password to create a sign-in account." }, { name: "password", label: "Initial password", type: "password", createOnly: true }, { name: "role", label: "Account role", type: "select", createOnly: true }
  ], columns: [["name", "Name"], ["designation", "Designation"], ["dept_name", "Department"], ["status", "Status"]] },
  departments: { label: "Departments", singular: "department", key: "dept_id", fields: [{ name: "dept_name", label: "Department name", required: true, maxLength: 100 }, { name: "head_emp_id", label: "Department head", type: "select" }], columns: [["dept_name", "Department"], ["head_name", "Department head"]] },
  projects: { label: "Projects", singular: "project", key: "project_id", fields: [{ name: "project_name", label: "Project name", required: true, maxLength: 150 }, { name: "dept_id", label: "Department", type: "select" }, { name: "status", label: "Status", type: "select", required: true }, { name: "start_date", label: "Start date", type: "date" }, { name: "end_date", label: "End date", type: "date" }, { name: "description", label: "Description", type: "textarea", wide: true }], columns: [["project_name", "Project"], ["dept_name", "Department"], ["status", "Status"], ["end_date", "End date"]] }
};
function initial(resource) { return resource === "projects" ? { status: "planned" } : resource === "employees" ? { role: "employee" } : {}; }

export default function Manage() {
  const [resource, setResource] = useState("employees");
  const [records, setRecords] = useState([]);
  const [options, setOptions] = useState({ employees: [], departments: [], projects: [] });
  const [form, setForm] = useState(initial("employees"));
  const [editing, setEditing] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const config = definitions[resource];
  async function reload() {
    const [rows, opts] = await Promise.all([api(`/api/${resource}`), api("/api/options")]);
    setRecords(rows); setOptions(opts);
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setEditing(null); setForm(initial(resource)); setError(""); setMessage("");
    Promise.all([api(`/api/${resource}`), api("/api/options")]).then(([rows, opts]) => { if (active) { setRecords(rows); setOptions(opts); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resource]);
  function choices(field) {
    if (field.name === "dept_id") return options.departments.map(d => ({ value: d.dept_id, label: d.dept_name }));
    if (["manager_id", "head_emp_id"].includes(field.name)) {
      const choices = options.employees.filter(e => field.name !== "manager_id" || e.emp_id !== editing).map(e => ({ value: e.emp_id, label: e.name }));
      const originalId = editingRecord?.[field.name];
      if (editing && originalId && !choices.some(option => String(option.value) === String(originalId))) {
        const currentName = field.name === "manager_id" ? editingRecord.manager_name : editingRecord.head_name;
        choices.push({ value: originalId, label: `${currentName || `Employee #${originalId}`} (current ${field.name === "manager_id" ? "manager" : "head"})` });
      }
      return choices;
    }
    if (field.name === "status") return ["planned", "ongoing", "completed", "on_hold"].map(value => ({ value, label: human(value) }));
    if (field.name === "role") return ["employee", "admin"].map(value => ({ value, label: human(value) }));
    return [];
  }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      if (resource === "employees" && !editing && (!!form.username !== !!form.password)) throw new Error("Provide both username and password, or leave both blank.");
      const payload = {};
      for (const field of config.fields.filter(f => !(editing && f.createOnly))) payload[field.name] = form[field.name] || null;
      await api(`/api/${resource}${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      setForm(initial(resource)); setEditing(null); await reload(); setMessage(`${config.singular[0].toUpperCase() + config.singular.slice(1)} saved.`);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  async function edit(record) {
    setError(""); setMessage("");
    try {
      const data = resource === "employees" ? (await api(`/api/employees/${record.emp_id}`)).employee : record;
      const next = {};
      for (const field of config.fields) next[field.name] = field.type === "date" ? data[field.name]?.slice(0, 10) || "" : data[field.name] ?? "";
      setEditing(record[config.key]); setEditingRecord(data); setForm(next); document.getElementById("record-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) { setError(e.message); }
  }
  async function remove(record) {
    setError(""); setMessage("");
    try { await api(`/api/${resource}/${record[config.key]}`, { method: "DELETE" }); await reload(); if (editing === record[config.key]) { setEditing(null); setForm(initial(resource)); } setMessage("Record deleted."); }
    catch (e) { setError(e.message); }
  }
  return <Layout title="People & projects" subtitle="Manage the people and structure behind your team's work.">
    <div className="tabs" aria-label="Record types">{Object.entries(definitions).map(([key, item]) => <button key={key} className={resource === key ? "tab selected" : "tab"} onClick={() => setResource(key)}>{item.label}</button>)}</div>
    <Alert>{error}</Alert><Alert success>{message}</Alert>
    <section className="card" id="record-form"><div className="section-heading"><div><h2>{editing ? "Edit" : "Add"} {config.singular}</h2><p>{resource === "employees" ? "Keep contribution history by using Handover when an employee leaves." : "Changes are available across the workspace immediately."}</p></div>{editing && <button className="secondary" onClick={() => { setEditing(null); setForm(initial(resource)); }}>Cancel edit</button>}</div><form onSubmit={save}><div className="form-grid">{config.fields.filter(f => !(editing && f.createOnly)).map(field => <Field key={`${resource}-${field.name}`} field={field} value={form[field.name]} options={choices(field)} onChange={value => setForm({ ...form, [field.name]: value })} />)}</div><div className="form-footer"><small>Fields marked * are required.</small><button disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : `Add ${config.singular}`}</button></div></form></section>
    <section className="card"><div className="section-heading"><h2>{config.label}</h2><span className="count">{records.length} records</span></div>{loading ? <Empty>Loading records…</Empty> : records.length ? <Table><thead><tr>{config.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th>Actions</th></tr></thead><tbody>{records.map(row => <tr key={row[config.key]}>{config.columns.map(([key]) => <td key={key}>{key === "status" ? <Pill value={row[key]} /> : key.endsWith("_date") ? date(row[key]) : row[key] || "—"}</td>)}<td><div className="row-actions"><button className="text-button" onClick={() => edit(row)}>Edit</button><DeleteButton onDelete={() => remove(row)} label={`Delete ${row.name || row.dept_name || row.project_name}`} /></div></td></tr>)}</tbody></Table> : <Empty>No {resource} yet. Add your first record above.</Empty>}</section>
  </Layout>;
}
export async function getServerSideProps(context) { return requirePage(context, true); }
