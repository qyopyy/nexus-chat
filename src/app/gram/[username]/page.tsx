import Root from "@/components/Root";

// /gram/<username> opens that NexusGram profile inside Nexus (Follow / Add friend from the public page land here)
export default async function GramPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <Root initialGram={decodeURIComponent(username).toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24)} />;
}
