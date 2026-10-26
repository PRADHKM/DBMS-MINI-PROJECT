// Server-side helpers for role-based access control in API routes.
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";
import { query } from './mysql';

// JWTs identify the account; the database remains the authority for access.
// Shared by API and page guards so a past departure or changed role applies to
// an existing session as well as to a new credentials login.
export async function getActiveAccount(empId) {
  if (!Number.isSafeInteger(Number(empId)) || Number(empId) <= 0) return null;
  return (await query(`SELECT u.user_id, u.emp_id, u.role, e.name, e.status, r.last_working_day
    FROM USER_ACCOUNT u JOIN EMPLOYEE e ON e.emp_id=u.emp_id
    LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id
    WHERE u.emp_id=? AND e.status='active'
      AND (r.last_working_day IS NULL OR r.last_working_day >= CURDATE())`, [Number(empId)]))[0] || null;
}

export async function requireSession(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const user = await getActiveAccount(session.user?.empId);
  if (!user) {
    res.status(401).json({ error: 'Your account is inactive. Please sign out.' });
    return null;
  }
  session.user = { ...session.user, role: user.role, name: user.name, empId: user.emp_id };
  return session;
}

// Usage inside an API route:
//   const session = await requireRole(req, res, ["admin"]);
//   if (!session) return;   // response already sent
export async function requireRole(req, res, allowedRoles) {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (!allowedRoles.includes(session.user.role)) {
    res.status(403).json({ error: "Forbidden — insufficient role" });
    return null;
  }
  return session;
}
