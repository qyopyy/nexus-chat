import Root from "@/components/Root";

/** /gram/p/<id> opens a NexusGram post inside the app */
export default async function GramPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Root initialGramPost={id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)} />;
}
