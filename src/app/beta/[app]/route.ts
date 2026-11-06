import { TF_APPS, TF_URL_RE, type TfApp } from "@/lib/testflight";
import { countOpen, fetchTfLinks } from "../data";

export const dynamic = "force-dynamic";

/** Short invite link: /beta/<app> → counts the tap, then opens the TestFlight public link. */
export async function GET(req: Request, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const id = TF_APPS.find((a) => a.id === app)?.id as TfApp | undefined;
  const back = new URL("/beta", req.url);
  if (!id) return Response.redirect(back, 302);
  const link = (await fetchTfLinks())[id];
  if (!link || !TF_URL_RE.test(link.url)) return Response.redirect(back, 302);
  await countOpen(id);
  return new Response(null, { status: 302, headers: { Location: link.url, "Cache-Control": "no-store" } });
}
