import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Alert } from "../components/ui";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await signIn("credentials", { redirect: false, username, password });
      if (!result?.ok || result?.error) throw new Error("Unable to sign in. Check your username and password.");
      const callback = typeof router.query.callbackUrl === "string" ? router.query.callbackUrl : "";
      const destination = callback.startsWith("/") && !callback.startsWith("//") && !callback.includes("\\") && !callback.startsWith("/login") ? callback : "/dashboard";
      await router.push(destination);
    } catch (e) { setError(e.message || "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }
  return <><Head><title>Sign in · Workload</title></Head><main className="auth-page"><section className="auth-intro"><div className="brand"><span className="brand-mark">W</span><span>Workload</span></div><div><p className="eyebrow">KNOWLEDGE THAT STAYS</p><h1>Keep the work.<br />Carry it forward.</h1><p>A shared record of contributions, assignments and experience — ready whenever your team needs it.</p><div className="intro-tags"><span>Work tracking</span><span>Team knowledge</span><span>Smooth handovers</span></div></div><small>Workload Management System · DBMS project</small></section><section className="auth-form-panel"><form className="auth-card" onSubmit={submit}><p className="eyebrow">YOUR TEAM WORKSPACE</p><h2>Welcome back</h2><p className="subtitle">Sign in to see what your team is building.</p><label className="field" htmlFor="username"><span>Username</span><input id="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={50} /></label><label className="field" htmlFor="password"><span>Password</span><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><Alert>{error}</Alert><button disabled={busy}>{busy ? "Signing in…" : "Sign in →"}</button><small className="auth-help">Use the account provided by your workspace administrator.</small></form></section></main></>;
}
