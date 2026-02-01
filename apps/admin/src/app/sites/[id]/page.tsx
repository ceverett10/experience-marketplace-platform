import SiteDetailClient from './SiteDetailClient';

// Required for dynamic routes with App Router
export function generateStaticParams() {
  // Return empty array - pages are fetched dynamically at runtime
  return [];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <SiteDetailClient siteId={id} />;
}
