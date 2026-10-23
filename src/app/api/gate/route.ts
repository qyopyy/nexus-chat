import { NextResponse } from "next/server";
import { GATE_COOKIE, gateHash, tokenValid } from "@/lib/gate-server";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rec = attempts.get(ip);
  if (rec && rec.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  let password = "";
  try {
    password = String((await req.json())?.password ?? "");
  } catch {
    /* bad body */
  }
  const token = gateHash(password);

  if (!tokenValid(token)) {
    const n = (rec?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, token, {
    httpOnly: false, // the app forwards it to the signup function as proof of passing the gate
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(GATE_COOKIE);
  return res;
}
