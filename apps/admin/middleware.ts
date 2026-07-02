import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const secret = process.env.ADMIN_SECRET ?? "";

export function middleware(req: NextRequest) {
  // Allow if cookie is set
  const cookie = req.cookies.get("admin_auth")?.value;
  if (cookie === secret) return NextResponse.next();

  // Allow the login page itself
  if (req.nextUrl.pathname === "/login") return NextResponse.next();

  // Redirect to login
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
