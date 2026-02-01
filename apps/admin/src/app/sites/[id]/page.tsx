import SiteDetailClient from './SiteDetailClient';

// Force dynamic rendering - this page fetches data at runtime
export const dynamic = 'force-dynamic';

// Required for static export - return empty so no pages are pre-rendered
export function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SiteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <SiteDetailClient siteId={id} />;
}
