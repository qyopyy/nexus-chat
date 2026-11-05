import { redirect } from "next/navigation";
import { headers } from "next/headers";

/** Wump-branded invite deep link (same codes as /bump/{code}) */
export default async function WumpInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const h = await headers();
  const ua = h.get("user-agent") || "";
  const standalone = /BumpApp|WumpApp/i.test(ua);
  const q = encodeURIComponent(code);
  redirect(standalone ? `/wump/app?bump=${q}` : `/?bump=${q}`);
}
