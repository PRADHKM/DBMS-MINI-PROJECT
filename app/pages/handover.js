import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { requirePage } from "../components/server";
import { api, Layout, Field, Alert, Empty, Table, Pill, date } from "../components/ui";
import { domainNames } from "../lib/domain-names.mjs";

function EmployeeDetails({ name, dept, designation, skills, domains, id }) {
  if (!name) return "No successor";
  const list = [...(skills || [])].sort((a, b) => a.name.localeCompare(b.name));
  return <div className="handover-person">
    {id ? <Link href={`/employees/${id}`}>{name}</Link> : <strong>{name}</strong>}
    <span className="cell-subtitle handover-domain">Domains: {domainNames({ designation, dept_name: dept, domains }).join(" · ") || "Not recorded"}</span>
    <span className="cell-subtitle">Department: {dept || "Unassigned"}</span>
    <span className="cell-subtitle">Skills: {list.length ? list.map(s => `${s.name} (${s.proficiency})`).join(", ") : "None recorded"}</span>
  </div>;
}

export default function Handover() {
  const router = useRouter();
  const [options, setOptions] = useState({ employees: [], tasks: [] });
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [opts, rows, pending] = await Promise.all([
      api("/api/options"), api("/api/resignations"), api("/api/resignation-requests"),
    ]);
    setOptions(opts);
    setHistory(rows);
    setRequests(pending);
  }
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (router.query.emp_id) setForm(current => ({ ...current, emp_id: router.query.emp_id }));
  }, [router.query.emp_id]);

  const { employees, tasks, today } = options;
  const departing = employees.find(e => String(e.emp_id) === String(form.emp_id));
  const successor = employees.find(e => String(e.emp_id) === String(form.handover_to));
  const awaitingReview = requests.find(row => row.emp_id === departing?.emp_id);
  const openTasks = tasks.filter(t => String(t.assigned_to) === String(form.emp_id) && t.status !== "completed").length;
  const dates = { resignation_date: form.resignation_date ?? today, last_working_day: form.last_working_day ?? today };
  const fields = [
    { name: "emp_id", label: "Departing employee", type: "select", required: true, disabled: Boolean(request) },
    { name: "handover_to", label: "Handover to", type: "select", required: openTasks > 0 },
    { name: "resignation_date", label: "Resignation date", type: "date", required: true, max: today, disabled: Boolean(request) },
    { name: "last_working_day", label: "Last working day", type: "date", required: true, min: dates.resignation_date },
    { name: "handover_notes", label: "Handover notes", type: "textarea", wide: true, help: "Include outstanding decisions, useful documents and next steps." },
  ];

  async function process() {
    setBusy(true);
    setError("");
    try {
      if (request) {
        await api(`/api/resignation-requests/${request.request_id}`, {
          method: "PUT",
          body: JSON.stringify({
            decision: "approved", last_working_day: dates.last_working_day,
            handover_to: form.handover_to, handover_notes: form.handover_notes,
          }),
        });
      } else {
        await api("/api/resignations", { method: "POST", body: JSON.stringify({ ...form, ...dates }) });
      }
      setSaved({ id: departing.emp_id, hasSuccessor: Boolean(successor) });
      setForm({});
      setRequest(null);
      setReviewing(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function startReview(row) {
    setError("");
    setSaved(null);
    setRequest(row);
    setReviewing(false);
    setForm({ emp_id: String(row.emp_id), resignation_date: row.submitted_on, last_working_day: row.proposed_last_day });
  }

  async function decline() {
    if (!window.confirm(`Decline ${request.employee_name}'s resignation request?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/resignation-requests/${request.request_id}`, {
        method: "PUT", body: JSON.stringify({ decision: "declined" }),
      });
      setRequest(null);
      setForm({});
      setSaved({ declined: true });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function review(event) {
    event.preventDefault();
    setError("");
    setSaved(null);
    if (!departing) { setError("Choose a departing employee."); return; }
    if (!request && awaitingReview) { startReview(awaitingReview); return; }
    if (openTasks && !successor) { setError("Choose a successor for the open tasks."); return; }
    if (dates.last_working_day < dates.resignation_date) { setError("Last working day must be on or after the resignation date."); return; }
    setReviewing(true);
  }

  return <Layout title="Employee handover" subtitle="Pass open work forward while preserving the history behind it.">
    <Alert>{error}</Alert>
    {saved?.declined && <Alert success>Resignation request declined.</Alert>}
    {saved?.id && <div className="notice success" role="status">{saved.hasSuccessor ? "Handover recorded and any open tasks reassigned." : "Handover recorded."} <Link href={`/employees/${saved.id}`}>View the departing employee's history and generate a summary →</Link></div>}
    <section className="card">
      <div className="section-heading"><h2>Pending resignation requests</h2><button className="secondary" disabled={busy || loading} onClick={() => load().catch(e => setError(e.message))}>Refresh requests</button></div>
      {loading ? <Empty>Loading requests…</Empty> : requests.length ? <Table>
        <thead><tr><th>Employee</th><th>Submitted</th><th>Proposed last day</th><th>Employee notes</th><th>Action</th></tr></thead>
        <tbody>{requests.map(row => <tr key={row.request_id}>
          <td>{row.employee_name}</td><td>{date(row.submitted_on)}</td><td>{date(row.proposed_last_day)}</td>
          <td className="notes">{row.employee_notes || "—"}</td>
          <td><button className="secondary" disabled={busy} onClick={() => {
            startReview(row);
            document.getElementById("handover-form")?.scrollIntoView({ behavior: "smooth" });
          }}>Review request</button></td>
        </tr>)}</tbody>
      </Table> : <Empty>No requests awaiting review.</Empty>}
    </section>
    <section className="card" id="handover-form">
      <div className="section-heading"><div><p className="eyebrow">KNOWLEDGE CONTINUITY</p><h2>{reviewing ? "Review this handover" : request ? `Review ${request.employee_name}'s request` : "Start a handover"}</h2><p>Open tasks transfer upon approval. The departing account stays active through the last working day.</p></div></div>
      {request?.employee_notes && <p className="notes"><strong>Employee notes</strong> {request.employee_notes}</p>}
      {loading ? <Empty>Loading employees…</Empty> : reviewing ? <div className="review-panel">
        <dl>
          <div><dt>Departing employee</dt><dd><EmployeeDetails name={departing?.name} dept={departing?.dept_name} designation={departing?.designation} skills={departing?.skills} domains={departing?.domains} /></dd></div>
          <div><dt>New task owner</dt><dd><EmployeeDetails name={successor?.name} dept={successor?.dept_name} designation={successor?.designation} skills={successor?.skills} domains={successor?.domains} /></dd></div>
          <div><dt>Resignation date</dt><dd>{dates.resignation_date}</dd></div>
          <div><dt>Last working day</dt><dd>{dates.last_working_day}</dd></div>
        </dl>
        <p className="notes">{form.handover_notes || "No handover notes provided."}</p>
        <p>This records the resignation and transfers unfinished tasks. Work logs stay with their original authors.</p>
        <div className="button-row"><button disabled={busy} onClick={process}>{busy ? "Processing…" : request ? "Approve resignation" : "Confirm handover"}</button><button className="secondary" disabled={busy} onClick={() => setReviewing(false)}>Back to edit</button></div>
      </div> : <form onSubmit={review}>
        <div className="form-grid">{fields.map(field => {
          const control = <Field
            key={field.name}
            field={field}
            value={dates[field.name] ?? form[field.name]}
            options={field.type === "select" ? employees
              .filter(employee => field.name !== "handover_to" || employee.emp_id !== departing?.emp_id)
              .map(employee => ({
                value: employee.emp_id,
                label: `${employee.name} — ${domainNames(employee).join(" · ") || "Unassigned"}`,
              })) : []}
            onChange={value => setForm(current => ({
              ...current,
              [field.name]: value,
              ...(field.name === "emp_id" && value === current.handover_to ? { handover_to: "" } : {}),
            }))}
          />;
          if (field.type !== "select") return control;
          const employee = field.name === "emp_id" ? departing : successor;
          return <div key={field.name} className="handover-employee-field">
            {control}
            {employee ? <div className="handover-selection" role="group" aria-label={field.name === "emp_id" ? "Selected departing employee" : "Selected successor"}>
              <EmployeeDetails name={employee.name} dept={employee.dept_name} designation={employee.designation} skills={employee.skills} domains={employee.domains} />
            </div> : <p className="handover-selection-empty">Choose an employee to see their domain and skills.</p>}
          </div>;
        })}</div>
        <div className="form-footer"><small>A successor is required when the departing employee has open tasks.</small><button disabled={busy || !employees.length}>{!request && awaitingReview ? "Open pending request →" : "Review handover →"}</button></div>
        {request && <div className="button-row">
          <button type="button" className="secondary" onClick={decline} disabled={busy}>Decline request</button>
          <button type="button" className="secondary" onClick={() => { setRequest(null); setForm({}); setError(""); }} disabled={busy}>Close request</button>
        </div>}
      </form>}
    </section>
    <section className="card">
      <div className="section-heading"><h2>Handover history</h2><span className="count">{history.length} records</span></div>
      {loading ? <Empty>Loading handovers…</Empty> : history.length ? <Table>
        <thead><tr><th>Departing employee</th><th>Successor</th><th>Status</th><th>Resignation date</th><th>Last working day</th><th>Notes</th></tr></thead>
        <tbody>{history.map(r => <tr key={r.resignation_id}>
          <td><EmployeeDetails id={r.emp_id} name={r.employee_name} dept={r.employee_department} designation={r.employee_designation} skills={r.employee_skills} domains={r.employee_domains} /></td>
          <td><EmployeeDetails id={r.handover_to} name={r.handover_name} dept={r.successor_department} designation={r.successor_designation} skills={r.successor_skills} domains={r.successor_domains} /></td>
          <td><Pill value={r.status} /></td><td>{date(r.resignation_date)}</td><td>{date(r.last_working_day)}</td><td className="notes">{r.handover_notes || "—"}</td>
        </tr>)}</tbody>
      </Table> : <Empty>No handovers have been recorded.</Empty>}
    </section>
  </Layout>;
}
export async function getServerSideProps(context) { return requirePage(context, true); }
