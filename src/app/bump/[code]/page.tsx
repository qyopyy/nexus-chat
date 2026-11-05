import { redirect } from "next/navigation";

/** Bump invite deep link → app with ?bump= (uses /bump/ so it does not collide with bot /b/[slug]) */
export default async function BumpInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/?bump=${encodeURIComponent(code)}`);
}
