import { redirect } from "next/navigation";
import { headers } from "next/headers";

/** Wump group invite → open app with ?wumpGroup= */
export default async function WumpGroupInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const h = await headers();
  const ua = h.get("user-agent") || "";
  const standalone = /BumpApp|WumpApp/i.test(ua);
  const q = encodeURIComponent(code);
  redirect(standalone ? `/bump/app?wumpGroup=${q}` : `/?wumpGroup=${q}`);
}
