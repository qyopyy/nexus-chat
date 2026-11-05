import Root from "@/components/Root";

/** /gram/c/<id> opens NexusGram content (post or story) inside the app */
export default async function GramContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Root initialGramContent={id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)} />;
}
