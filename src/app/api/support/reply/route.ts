import { NextResponse } from "next/server";
import { emailConfigured, replyMail, rpc, sendMail, supportAddress } from "@/lib/supportMail";

export const dynamic = "force-dynamic";

type Reply = { message_id: number; ticket_no: number; email: string; name: string; subject: string; key: string; id: string; staff: string | null };

/** staff answer: POST { ticketId, body, close } with the staff member's Supabase access token */
export async function POST(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { ticketId?: string; body?: string; close?: boolean } | null;
  const text = String(b?.body ?? "").trim().slice(0, 5000);
  if (!b?.ticketId || text.length < 2) return NextResponse.json({ error: "Write a reply first" }, { status: 400 });
  // the database checks staff rank — the token decides who's replying
  const { data, error } = await rpc<Reply>("staff_reply_ticket", { p_id: b.ticketId, p_body: text, p_close: !!b.close }, jwt);
  if (error || !data) return NextResponse.json({ error: error ?? "Couldn't save the reply" }, { status: 400 });
  const m = replyMail(data, text, !!b.close);
  let emailed = false;
  if (emailConfigured()) {
    emailed = await sendMail(data.email, m.subject, m.html, m.text);
    if (emailed) await rpc("staff_mark_emailed", { p_message: data.message_id }, jwt);
  }
  // fallback the admin UI can open in the staff member's own mail app
  const mailto = `mailto:${encodeURIComponent(data.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}&cc=${encodeURIComponent(supportAddress())}`;
  return NextResponse.json({ ok: true, emailed, configured: emailConfigured(), mailto });
}
