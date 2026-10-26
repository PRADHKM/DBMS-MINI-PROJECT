import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "../../../lib/mysql";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (typeof credentials?.username !== 'string' || typeof credentials?.password !== 'string' || credentials.username.length > 50 || Buffer.byteLength(credentials.password, 'utf8') > 72) return null;
        const rows = await query(
          `SELECT u.user_id, u.emp_id, u.username, u.password_hash, u.role, e.name
           FROM USER_ACCOUNT u JOIN EMPLOYEE e ON u.emp_id = e.emp_id
           LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id
           WHERE u.username = ? AND e.status='active'
             AND (r.last_working_day IS NULL OR r.last_working_day >= CURDATE())`,
          [credentials.username.trim()]
        );
        const user = rows[0];
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        // Object returned here becomes the JWT payload via the callbacks below
        return {
          id: String(user.user_id),
          empId: user.emp_id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.empId = user.empId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.empId = token.empId;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
