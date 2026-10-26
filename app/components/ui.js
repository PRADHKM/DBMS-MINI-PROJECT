import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";

export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  } catch {
    throw new Error("Unable to reach the server. Please try again.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

export function human(value) { return String(value || "—").replaceAll("_", " "); }
export function date(value) { return value ? String(value).slice(0, 10) : "—"; }
export function Pill({ value }) { return <span className={`pill ${value || ""}`}>{human(value)}</span>; }
export function Alert({ children, success = false }) { return children ? <div className={`notice ${success ? "success" : "error"}`} role={success ? "status" : "alert"}>{children}</div> : null; }
export function Empty({ children = "No records yet." }) { return <p className="empty">{children}</p>; }
export function Table({ children }) { return <div className="table-wrap"><table>{children}</table></div>; }

export function Layout({ title, subtitle, children, action }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = router.asPath.split(/[?#]/)[0];
  const admin = session?.user?.role === "admin";
  const links = [["/dashboard", "Overview"], ["/tasks", "Tasks"], ["/worklogs", "Work logs"], ...(admin ? [["/manage", "People & projects"], ["/handover", "Handover"]] : [[`/employees/${session?.user?.empId}`, "My profile"]])];
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/dashboard"><span className="brand-mark">W</span><span>Workload<span className="brand-caption">Knowledge stays with the team</span></span></Link>
      <nav aria-label="Main navigation">{links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "nav-link selected" : "nav-link"}>{label}</Link>)}</nav>
      <div className="sidebar-bottom"><span className="user-avatar">{(session?.user?.name || "U").slice(0, 1)}</span><div><strong>{session?.user?.name || "Your workspace"}</strong><span>{session?.user?.role || "Account"}</span></div><button className="text-button" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div>
    </aside>
    <main className="main"><header className="page-heading"><div><p className="eyebrow">TEAM WORKSPACE</p><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>{action}</header>{children}</main>
  </div>;
}

export function Field({ field, value, onChange, options = [] }) {
  const id = `field-${field.name}`;
  const shared = { id, name: field.name, value: value ?? "", onChange: e => onChange(e.target.value), required: !!field.required, disabled: !!field.disabled };
  return <label className={field.wide ? "field wide" : "field"} htmlFor={id}><span>{field.label}{field.required && <span aria-hidden="true"> *</span>}</span>
    {field.type === "select" ? <select {...shared}><option value="">{field.required ? "Select an option" : "None"}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea {...shared} rows={3} maxLength={field.maxLength || 10000} /> : <input {...shared} type={field.type || "text"} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || (field.type === "password" ? 72 : 150)} autoComplete={field.type === "password" ? "new-password" : undefined} />}
    {field.help && <small>{field.help}</small>}
  </label>;
}

export function DeleteButton({ onDelete, label = "Delete record" }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? <span className="delete-confirm"><span>Delete?</span><button type="button" className="danger small" onClick={async () => { await onDelete(); setConfirming(false); }}>Confirm</button><button type="button" className="secondary small" onClick={() => setConfirming(false)}>Keep</button></span> : <button type="button" aria-label={label} className="text-button danger-text" onClick={() => setConfirming(true)}>Delete</button>;
}
