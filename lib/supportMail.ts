/**
 * Server-only helpers for help tickets: calling Supabase RPCs over REST and sending email through Resend.
 * Email is optional — set RESEND_API_KEY (and SUPPORT_FROM, a sender on a domain verified in Resend) in Vercel.
 * Without it tickets and replies are still saved; staff get a "send from your email" button instead.
 */
import { SITE } from "./seo";

const base = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function rpc<T>(fn: string, args: Record<string, unknown>, userJwt?: string | null): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(`${base()}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: anon(), Authorization: `Bearer ${userJwt || anon()}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { data: null, error: (j && (j.message || j.error)) || `Request failed (${r.status})` };
    return { data: j as T, error: null };
  } catch {
    return { data: null, error: "Support is unreachable right now" };
  }
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY;
export const supportAddress = () => process.env.SUPPORT_EMAIL || "owner@qyopy.hu";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function ticketLink(id: string, key: string) {
  return `${SITE.url}/contact/ticket?id=${encodeURIComponent(id)}&k=${encodeURIComponent(key)}`;
}

function layout(title: string, bodyHtml: string, cta?: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#0b0c0f;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8e8ea">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-size:20px;font-weight:800;letter-spacing:-.3px;color:#fff">Nexus <span style="color:#8b8b93;font-weight:600">Support</span></div>
  <div style="margin-top:20px;background:#17181c;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 12px;font-size:18px;color:#fff">${esc(title)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#d0d0d6">${bodyHtml}</div>
    ${cta ? `<a href="${esc(cta.href)}" style="display:inline-block;margin-top:20px;background:#5865f2;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${esc(cta.label)}</a>` : ""}
  </div>
  <p style="margin-top:16px;font-size:12px;color:#77777f">You can reply to this email or use the button above. ${esc(SITE.url.replace(/^https?:\/\//, ""))}</p>
</div></body></html>`;
}

const para = (t: string) => esc(t).replace(/\n/g, "<br>");

export async function sendMail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.SUPPORT_FROM || "Nexus Support <support@nexusproject.cc>", to: [to], reply_to: supportAddress(), subject, html, text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function confirmationMail(t: { ticket_no: number; name: string; subject: string; id: string; key: string }, message: string) {
  const link = ticketLink(t.id, t.key);
  const subject = `[Nexus #${t.ticket_no}] We got your message: ${t.subject}`;
  const html = layout(`Thanks, ${t.name} — ticket #${t.ticket_no} is open`, `<p>We'll get back to you by email, usually within a day.</p><p style="color:#8b8b93;margin-top:16px">Your message</p><p>${para(message)}</p>`, { href: link, label: "View your ticket" });
  const text = `Thanks, ${t.name} — ticket #${t.ticket_no} is open.\n\nWe'll reply by email.\n\nYour message:\n${message}\n\nView it: ${link}`;
  return { subject, html, text };
}

export function replyMail(t: { ticket_no: number; name: string; subject: string; id: string; key: string; staff?: string | null }, reply: string, closed: boolean) {
  const link = ticketLink(t.id, t.key);
  const subject = `Re: [Nexus #${t.ticket_no}] ${t.subject}`;
  const who = t.staff ? `${t.staff} from Nexus Support` : "Nexus Support";
  const html = layout(`Hi ${t.name},`, `<p>${para(reply)}</p><p style="color:#8b8b93;margin-top:18px">— ${esc(who)}</p>${closed ? `<p style="color:#8b8b93">This ticket is now closed. Reply any time to reopen it.</p>` : ""}`, { href: link, label: "Reply to this ticket" });
  const text = `Hi ${t.name},\n\n${reply}\n\n— ${who}\n\nReply: ${link}`;
  return { subject, html, text };
}
