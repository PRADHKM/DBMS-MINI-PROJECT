// Edge middleware: blocks unauthenticated access to protected pages
// at the routing layer (in addition to the per-route RBAC checks in
// lib/auth.js, which enforce role for API routes/data access).
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;
  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;

  if (!token) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role and employment decisions use fresh database records in requirePage.
  // A JWT role can be stale after an account is promoted or demoted.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/employees/:path*", "/tasks/:path*", "/worklogs/:path*", "/manage/:path*", "/handover/:path*"],
};
