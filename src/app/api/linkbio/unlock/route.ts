export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { u?: string; password?: string };
    const u = String(body.u ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
    const password = String(body.password ?? "");
    if (!u || !password) return Response.json({ ok: false, error: "missing" }, { status: 400 });

    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/linkbio_check_password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ p_username: u, p_password: password }),
      cache: "no-store",
    });
    const j = (await r.json()) as { ok?: boolean; token?: string | null; error?: string };
    if (!j?.ok || !j.token) return Response.json({ ok: false, error: j?.error || "wrong password" }, { status: 401 });

    const res = Response.json({ ok: true });
    res.headers.append(
      "Set-Cookie",
      `lb_unlock_${u}=${encodeURIComponent(j.token)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return res;
  } catch {
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
