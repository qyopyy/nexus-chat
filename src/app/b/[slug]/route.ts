import { botNotFound, renderBotPage, systemBotPage, type PublicBotPage } from "@/lib/botPage";

export const dynamic = "force-dynamic";

/** Public bot profile + invite: /b/<slug> */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 31);
  const html = { "Content-Type": "text/html; charset=utf-8" };
  const base = new URL(req.url).origin;

  let bot = systemBotPage(slug);
  if (!bot) {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/bot_by_slug`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
        },
        body: JSON.stringify({ p_slug: slug }),
        cache: "no-store",
      });
      if (r.ok) {
        const j = (await r.json()) as Record<string, unknown> | null;
        if (j && j.kind === "community") {
          const cmds = Array.isArray(j.commands)
            ? (j.commands as { cmd?: string }[]).map((c) => `/${String(c.cmd ?? "").replace(/^\//, "")}`).filter((c) => c.length > 1)
            : [];
          bot = {
            kind: "community",
            slug: String(j.slug),
            name: String(j.name),
            description: String(j.description ?? ""),
            color: String(j.color ?? "#5865F2"),
            commands: cmds,
          } satisfies PublicBotPage;
        } else if (j && j.kind === "system") {
          bot = systemBotPage(String(j.slug ?? slug));
        }
      }
    } catch {
      /* network */
    }
  }

  if (!bot) return new Response(botNotFound(slug, base), { status: 404, headers: html });
  return new Response(renderBotPage(bot, base), { headers: { ...html, "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
