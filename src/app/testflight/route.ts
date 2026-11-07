import { TF_URL_RE } from "@/lib/testflight";
import { countOpen, fetchTfLinks } from "../beta/data";

export const dynamic = "force-dynamic";

/** One-tap TestFlight invite: nexusproject.cc/testflight → straight to the Nexus TestFlight join page. */
export async function GET(req: Request) {
  const link = (await fetchTfLinks()).nexus;
  if (!link || !TF_URL_RE.test(link.url)) return Response.redirect(new URL("/beta", req.url), 302);
  await countOpen("nexus");
  return new Response(null, { status: 302, headers: { Location: link.url, "Cache-Control": "no-store" } });
}
