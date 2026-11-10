import type { Metadata } from "next";
import AcetateProfile from "@/components/acetate/AcetateSocial";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: { absolute: `@${username} · Acetate` }, robots: { index: true, follow: true } };
}

export default async function AcetateProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <AcetateProfile username={username} />;
}
