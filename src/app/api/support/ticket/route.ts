import { NextResponse } from "next/server";
import { confirmationMail, emailConfigured, rpc, sendMail, ticketLink } from "@/lib/supportMail";

export const dynamic = "force-dynamic";

// light per-instance flood guard (the database also limits per email)
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

type Ticket = { id: string; ticket_no: number; key: string; email: string; name: string; subject: string };

/** Contact us: POST { name, email, category, subject, message, website (honeypot) } */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (tooMany(ip)) return NextResponse.json({ error: "Too many messages — try again in a few minutes" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  if (str("website", 200)) return NextResponse.json({ ok: true, ticket_no: 0 }); // bots fill the hidden field
  const name = str("name", 80);
  const email = str("email", 254);
  const subject = str("subject", 120);
  const message = String(b.message ?? "").trim().slice(0, 5000);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || subject.length < 3 || message.length < 10)
    return NextResponse.json({ error: "Fill in your name, a valid email, a subject and a message (10+ characters)" }, { status: 400 });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || null;
  const { data, error } = await rpc<Ticket>("submit_support_ticket", { p_name: name, p_email: email, p_category: str("category", 20) || "general", p_subject: subject, p_message: message }, jwt);
  if (error || !data) return NextResponse.json({ error: error ?? "Couldn't send" }, { status: 400 });
  let emailed = false;
  if (emailConfigured()) {
    const m = confirmationMail(data, message);
    emailed = await sendMail(data.email, m.subject, m.html, m.text);
  }
  return NextResponse.json({ ok: true, ticket_no: data.ticket_no, link: ticketLink(data.id, data.key), emailed });
}
