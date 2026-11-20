import { useEffect, useState } from "react";
import { api, Layout, Field, Alert, Empty, Pill, Table, date } from "../components/ui";
import { requirePage } from "../components/server";

export default function Resignation() {
  const [details, setDetails] = useState(null);
  const [proposedDay, setProposedDay] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [options, requests] = await Promise.all([api("/api/options"), api("/api/resignation-requests")]);
    setDetails({ today: options.today, status: options.employees[0]?.status, requests });
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);

  async function refresh() {
    setError("");
    try { await load(); }
    catch (e) { setError(e.message); }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/api/resignation-requests", {
        method: "POST",
        body: JSON.stringify({ proposed_last_day: proposedDay ?? details.today, employee_notes: notes }),
      });
      setProposedDay(null);
      setNotes("");
      setMessage("Request sent to the admin for review.");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const requests = details?.requests ?? [];
  const pending = requests.some(request => request.status === "pending");
  const canSubmit = details?.status === "active" && !pending && !requests.some(request => request.status === "approved");

  return <Layout title="Resignation" subtitle="Send a request to your admin and track their decision.">
    <Alert>{error}</Alert><Alert success>{message}</Alert>
    {canSubmit && <section className="card">
      <h2>Request resignation</h2>
      <p>Your admin will confirm your last working day and arrange the handover.</p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field field={{ name: "proposed_last_day", label: "Proposed last working day", type: "date", min: details.today, required: true }} value={proposedDay ?? details.today} onChange={setProposedDay} />
          <Field field={{ name: "employee_notes", label: "Notes for the admin", type: "textarea", wide: true }} value={notes} onChange={setNotes} />
        </div>
        <div className="form-footer"><button disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></div>
      </form>
    </section>}
    <section className="card">
      <div className="section-heading"><h2>My resignation requests</h2><button className="secondary" onClick={refresh} disabled={busy}>Refresh status</button></div>
      {!details ? <Empty>Loading your requests…</Empty> : requests.length ? <Table>
        <thead><tr><th>Submitted</th><th>Proposed last day</th><th>Decision</th><th>Approved last day</th><th>Successor</th></tr></thead>
        <tbody>{requests.map(request => <tr key={request.request_id}>
          <td>{date(request.submitted_on)}</td><td>{date(request.proposed_last_day)}</td><td><Pill value={request.status} /></td>
          <td>{date(request.last_working_day)}</td><td>{request.successor_name || "—"}</td>
        </tr>)}</tbody>
      </Table> : <Empty>You haven't submitted a request.</Empty>}
      {pending && <p>Your request is awaiting admin review.</p>}
    </section>
  </Layout>;
}

export async function getServerSideProps(context) {
  const result = await requirePage(context);
  if (result.props?.session.user.role === "admin") return { redirect: { destination: "/handover", permanent: false } };
  return result;
}
