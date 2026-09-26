import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({})) as { user?: string; password?: string; remember?: boolean | string };
  const valid = Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) &&
    body.user === process.env.ADMIN_USER && body.password === process.env.ADMIN_PASSWORD;

  if (!valid) {
    attempts.set(address, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: now + 10 * 60 * 1000 });
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }

  attempts.delete(address);
  const remember = body.remember === true || body.remember === "true";
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(remember), sessionCookieOptions(remember));
  return response;
}
