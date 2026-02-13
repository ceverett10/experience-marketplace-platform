import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { Inter, Playfair_Display } from 'next/font/google';
import { getSiteFromHostname, generateBrandCSSVariables } from '@/lib/tenant';
import { SiteProvider } from '@/lib/site-context';
import { Header, TrustBar } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { EmailPopup } from '@/components/marketing/EmailPopup';
import { SocialProofToast } from '@/components/marketing/SocialProofToast';
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
  // On Heroku/Cloudflare, use x-forwarded-host to get the actual external domain
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    title: {
      template: site.seoConfig?.titleTemplate ?? '%s | Experience Marketplace',
      default: site.seoConfig?.defaultTitle ?? site.name,
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
      icon: site.brand?.faviconUrl
        ? { url: site.brand.faviconUrl, type: 'image/svg+xml' }
        : '/favicon.ico',
      apple: site.brand?.faviconUrl
        ? { url: site.brand.faviconUrl, type: 'image/svg+xml' }
        : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const headersList = await headers();
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);

  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: site.brand?.primaryColor ?? '#6366f1',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  // On Heroku/Cloudflare, use x-forwarded-host to get the actual external domain
  const hostname = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const brandCSS = generateBrandCSSVariables(site.brand);

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* Google Search Console Verification - Dynamic per site */}
        {site.gscVerificationCode && (
          <meta name="google-site-verification" content={site.gscVerificationCode} />
        )}
        {/* Preconnect to external APIs for faster resource loading */}
        <link rel="preconnect" href="https://api.production.holibob.tech" />
        <link rel="dns-prefetch" href="https://api.production.holibob.tech" />
        {/* Preconnect to image CDNs for faster image loading */}
        <link rel="preconnect" href="https://images.holibob.tech" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.holibob.tech" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {brandCSS && <style dangerouslySetInnerHTML={{ __html: brandCSS }} />}
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <SiteProvider site={site}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <TrustBar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <EmailPopup />
          <SocialProofToast />
        </SiteProvider>
        {/* Google Analytics - Dynamic per site */}
        <GoogleAnalytics measurementId={site.seoConfig?.gaMeasurementId} />
      </body>
    </html>
  );
}
