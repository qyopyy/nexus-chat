import Root from "@/components/Root";

// Unique release links: /release/<code> opens that release in Studio (owner + reviewers)
export default async function ReleasePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Root initialRelease={decodeURIComponent(code).replace(/[^a-z0-9]/gi, "").slice(0, 20)} />;
}
