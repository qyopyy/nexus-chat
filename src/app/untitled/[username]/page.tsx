import Root from "@/components/Root";

/** /untitled/<username> opens that Untitled profile inside Nexus */
export default async function UntitledAppPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <Root initialUntitled={decodeURIComponent(username).toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 24)} />;
}
