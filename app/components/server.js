import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";
import { getActiveAccount } from "../lib/auth";

export async function requirePage(context, adminOnly = false) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const account = await getActiveAccount(session.user?.empId);
  if (!account) return { redirect: { destination: "/login", permanent: false } };
  session.user = { ...session.user, role: account.role, name: account.name, empId: account.emp_id };
  if (adminOnly && session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };
  return { props: { session } };
}
