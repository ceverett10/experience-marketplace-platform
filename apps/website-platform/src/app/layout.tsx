import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { Inter, Playfair_Display } from 'next/font/google';
import { getSiteFromHostname, generateBrandCSSVariables } from '@/lib/tenant';
import { SiteProvider } from '@/lib/site-context';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import './globals.css';

// Load fonts
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

// Dynamic metadata generation
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: {
      template: site.seoConfig?.titleTemplate ?? '%s | Experience Marketplace',
      default: site.name,
    },
    description: site.seoConfig?.defaultDescription ?? site.description ?? '',
    keywords: site.seoConfig?.keywords ?? [],
    metadataBase: new URL(
      site.primaryDomain ? `https://${site.primaryDomain}` : `https://${hostname}`
    ),
    openGraph: {
      type: 'website',
      siteName: site.name,
      images: site.brand?.ogImageUrl ? [site.brand.ogImageUrl] : [],
    },
    twitter: {
      card: 'summary_large_image',
    },
    icons: {
      icon: site.brand?.faviconUrl ?? '/favicon.ico',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#6366f1',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const brandCSS = generateBrandCSSVariables(site.brand);

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>{brandCSS && <style dangerouslySetInnerHTML={{ __html: brandCSS }} />}</head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <SiteProvider site={site}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </SiteProvider>
      </body>
    </html>
  );
}
