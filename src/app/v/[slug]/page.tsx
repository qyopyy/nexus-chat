import Root from "@/components/Root";

// Custom video links: /v/<custom-slug or video id>
export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Root initialVideo={decodeURIComponent(slug)} />;
}
