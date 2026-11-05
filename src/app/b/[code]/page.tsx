import { redirect } from "next/navigation";

/** Bump invite deep link → app with ?bump= */
export default async function BumpInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/?bump=${encodeURIComponent(code)}`);
}
