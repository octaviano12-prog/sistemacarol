import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Configure ADMIN_USER e ADMIN_PASSWORD para liberar o sistema.", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Basic ")) {
    try {
      const [user, password] = atob(authorization.slice(6)).split(":");
      if (user === expectedUser && password === expectedPassword) return NextResponse.next();
    } catch {}
  }

  return new NextResponse("Acesso restrito", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Clínica Essência", charset="UTF-8"', "Cache-Control": "no-store" },
  });
}

export const config = { matcher: ["/((?!favicon.svg|_next/static|_next/image).*)"] };
