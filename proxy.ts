import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicRoute = pathname === "/login" || pathname === "/api/auth/login" || pathname === "/manifest.webmanifest" || pathname === "/sw.js" || pathname === "/app-icon.svg" || pathname === "/app-icon-maskable.svg";
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = await verifySessionToken(token);

  if (publicRoute) {
    if (authenticated && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return new NextResponse("Configure ADMIN_USER e ADMIN_PASSWORD para liberar o sistema.", { status: 503 });
  }

  if (!authenticated) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!favicon.svg|_next/static|_next/image).*)"] };
