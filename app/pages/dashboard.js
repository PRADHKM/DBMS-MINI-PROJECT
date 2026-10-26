import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { requirePage } from "../components/server";
import { api, Layout, Alert, Empty, Pill, Table, date } from "../components/ui";

export default function Dashboard() {
  const { data: session } = useSession();
  const admin = session?.user?.role === "admin";
  const [employees, setEmployees] = useState([]);
  const [options, setOptions] = useState({ departments: [], projects: [], tasks: [] });
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchNote, setSearchNote] = useState("");
  useEffect(() => { api("/api/options").then(setOptions).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ search, dept });
      api(`/api/employees?${params}`).then(data => { if (active) { setEmployees(data); setError(""); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [search, dept]);
  async function runSearch(event) {
    event.preventDefault(); setSearching(true); setSearchError(""); setSearchNote("");
    try { const data = await api("/api/search/semantic", { method: "POST", body: JSON.stringify({ question }) }); setResults(data.results || []); setSearchNote(data.note || ""); }
    catch (e) { setSearchError(e.message); }
    finally { setSearching(false); }
  }
  return <Layout title={admin ? "Team overview" : "Your workspace"} subtitle={admin ? "Keep work visible. Make every handover easier." : "Your assignments, daily work and contribution history in one place."} action={admin ? <Link className="button" href="/manage">Add employee</Link> : <Link className="button" href="/worklogs">Log your work</Link>}>
    <Alert>{error}</Alert>
    <div className="stats-grid"><div className="stat"><span>{admin ? "Employees in view" : "Your profile"}</span><strong>{loading ? "—" : employees.length}</strong><small>Structured work records</small></div><div className="stat"><span>Projects</span><strong>{options.projects.length}</strong><small>Across your workspace</small></div><div className="stat"><span>Open assignments</span><strong>{options.tasks.filter(t => t.status !== "completed").length}</strong><small>Ready for the next step</small></div></div>
    {admin && <section className="card knowledge-card"><div className="section-heading"><div><span className="eyebrow">TEAM KNOWLEDGE</span><h2>Find the experience you need</h2><p>Search saved work summaries using a question or topic.</p></div><span className="feature-mark" aria-hidden="true">✦</span></div><form className="search-form" onSubmit={runSearch}><label className="sr-only" htmlFor="semantic-query">Search team knowledge</label><input id="semantic-query" placeholder="Who has worked on the Kubernetes migration?" value={question} onChange={e => setQuestion(e.target.value)} required maxLength={1000} /><button disabled={searching || !question.trim()}>{searching ? "Searching…" : "Search knowledge"}</button></form><Alert>{searchError}</Alert>{searchNote && <p className="summary-meta">{searchNote}</p>}{results !== null && <div className="search-results">{results.length ? results.map(result => <article key={result.summary_id}><div className="section-heading"><Link href={`/employees/${result.emp_id}`}><strong>{result.employee?.name || `Employee #${result.emp_id}`}</strong></Link><small>{Number.isFinite(Number(result.similarity)) ? `${(Number(result.similarity) * 100).toFixed(0)}% similarity` : "Related summary"}</small></div><p>{result.summary_text}</p>{result.stale && <p className="summary-meta">Work records have changed since this summary. Open the profile to regenerate it.</p>}</article>) : <Empty>No matching summaries. Generate employee summaries from their profiles, then search again.</Empty>}</div>}</section>}
    <section className="card"><div className="section-heading"><div><h2>{admin ? "Employee directory" : "Your contribution history"}</h2><p>{admin ? "Find people, review assignments and preserve their work." : "Open your profile to review your work and generate a summary."}</p></div><span className="count">{employees.length} records</span></div>{admin && <div className="filters"><label><span className="sr-only">Search employees by name</span><input placeholder="Search employees by name…" value={search} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">Department</span><select value={dept} onChange={e => setDept(e.target.value)}><option value="">All departments</option>{options.departments.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>)}</select></label></div>}
      {loading ? <Empty>Loading employee records…</Empty> : employees.length ? <Table><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th><span className="sr-only">Profile</span></th></tr></thead><tbody>{employees.map(e => <tr key={e.emp_id}><td><strong>{e.name}</strong><span className="cell-subtitle">{e.designation || "Employee"}</span></td><td>{e.dept_name || "Unassigned"}</td><td><Pill value={e.status} /></td><td><Link href={`/employees/${e.emp_id}`}>View profile →</Link></td></tr>)}</tbody></Table> : <Empty>No employee records match your filters.</Empty>}
    </section>
  </Layout>;
}
export async function getServerSideProps(context) { return requirePage(context); }
