import type { Metadata } from "next";
import AcetateListen from "@/components/acetate/AcetateListen";
import { acetateShareInfo } from "@/lib/acetatePage";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const info = await acetateShareInfo(token);
  if (!info?.ok || !info.title) {
    return { title: { absolute: "Acetate" }, robots: { index: false, follow: false } };
  }
  const owner = info.owner_name || info.owner;
  const description = info.note || (owner ? `${owner} on Acetate` : "A private cut on Acetate");
  const listed = info.listing === "public" && !info.password;
  return {
    title: { absolute: `${info.title} · Acetate` },
    description,
    robots: listed ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title: info.title, description, type: "music.song" },
  };
}

export default async function AcetateSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcetateListen token={token} />;
}
