const encoder = new TextEncoder();

export const SESSION_COOKIE = "clinica_essencia_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${process.env.ADMIN_USER || "admin"}.${expiresAt}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token?: string) {
  if (!token || !secret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expiresAt, receivedSignature] = parts;
  if (user !== (process.env.ADMIN_USER || "admin") || Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;
  const expectedSignature = await sign(`${user}.${expiresAt}`);
  if (receivedSignature.length !== expectedSignature.length) return false;
  let different = 0;
  for (let index = 0; index < receivedSignature.length; index++) different |= receivedSignature.charCodeAt(index) ^ expectedSignature.charCodeAt(index);
  return different === 0;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};
