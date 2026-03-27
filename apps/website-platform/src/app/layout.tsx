import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { Inter, Playfair_Display } from 'next/font/google';
import { getSiteFromHostname, generateBrandCSSVariables } from '@/lib/tenant';
import { CURRENCY_COOKIE, getEffectiveCurrency } from '@/lib/currency';
import { getRelatedMicrosites } from '@/lib/microsite-experiences';
import { prisma } from '@/lib/prisma';

// Cache blog post checks per site/microsite to avoid querying DB on every render.
// TTL: 5 minutes — matches page revalidation period.
const blogCheckCache = new Map<string, { hasPosts: boolean; expiresAt: number }>();
const BLOG_CACHE_TTL = 5 * 60 * 1000;

// Evict expired entries every 10 minutes so the map doesn't accumulate stale site entries.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of blogCheckCache.entries()) {
      if (entry.expiresAt <= now) blogCheckCache.delete(key);
    }
  },
  10 * 60 * 1000
);

async function hasBlogPosts(key: string, where: Record<string, unknown>): Promise<boolean> {
  const cached = blogCheckCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.hasPosts;
  try {
    const count = await prisma.page.count({
      where: { ...where, type: 'BLOG', status: 'PUBLISHED' },
    });
    const result = count > 0;
    blogCheckCache.set(key, { hasPosts: result, expiresAt: Date.now() + BLOG_CACHE_TTL });
    return result;
  } catch {
    // DB unavailable (e.g. E2E with dummy URL) — default to false, cache briefly to avoid retries
    blogCheckCache.set(key, { hasPosts: false, expiresAt: Date.now() + BLOG_CACHE_TTL });
    return false;
  }
}
import { SiteProvider } from '@/lib/site-context';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { MetaPixel } from '@/components/analytics/MetaPixel';
import { EmailPopup } from '@/components/marketing/EmailPopup';
import { SocialProofToast } from '@/components/marketing/SocialProofToast';
import { CookieConsent } from '@/components/marketing/CookieConsent';
import { ExitIntentPopup } from '@/components/marketing/ExitIntentPopup';
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
      images:
        site.brand?.ogImageUrl || site.homepageConfig?.hero?.backgroundImage
          ? [site.brand?.ogImageUrl || (site.homepageConfig?.hero?.backgroundImage as string)]
          : [],
    },
    twitter: {
      card: 'summary_large_image',
    },
    icons: {
      icon: site.brand?.faviconUrl
        ? site.brand.faviconUrl.startsWith('http')
          ? { url: site.brand.faviconUrl, type: 'image/png' }
          : { url: '/favicon.ico', type: 'image/svg+xml' }
        : '/favicon.ico',
      apple: site.brand?.faviconUrl
        ? site.brand.faviconUrl.startsWith('http')
          ? { url: site.brand.faviconUrl, type: 'image/png' }
          : { url: '/favicon.ico', type: 'image/svg+xml' }
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

  // Resolve user's preferred currency from geo-detection cookie
  const cookieStore = await cookies();
  const currencyCookie = cookieStore.get(CURRENCY_COOKIE)?.value;
  site.primaryCurrency = getEffectiveCurrency(site.primaryCurrency, currencyCookie);

  const brandCSS = generateBrandCSSVariables(site.brand);

  // Fetch related microsites for footer cross-linking (only for microsites)
  if (site.micrositeContext?.micrositeId) {
    try {
      const related = await getRelatedMicrosites(
        site.micrositeContext.micrositeId,
        site.micrositeContext.supplierCities || [],
        site.micrositeContext.supplierCategories || [],
        5
      );
      site.relatedMicrosites = related.map((m) => ({
        fullDomain: m.fullDomain,
        siteName: m.siteName,
        tagline: m.tagline,
        categories: m.categories,
        cities: m.cities,
      }));
    } catch (err) {
      console.warn('[Layout] Failed to fetch related microsites:', err);
    }

    // Check if microsite has published blog posts (cached, silent on DB failure)
    site.hasBlogPosts = await hasBlogPosts(`ms:${site.micrositeContext.micrositeId}`, {
      micrositeId: site.micrositeContext.micrositeId,
    });
  } else if (site.id && !site.isParentDomain) {
    // Check if main site has published blog posts (cached, silent on DB failure)
    site.hasBlogPosts = await hasBlogPosts(`site:${site.id}`, { siteId: site.id });
  }

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
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-52GB7SVS');`,
          }}
        />
        {/* Google tag (gtag.js) - raw script tags for Google tag verification
             Next.js <Script> renders as <link rel="preload"> which crawlers ignore */}
        {(site.seoConfig?.gaMeasurementId || site.seoConfig?.googleAdsId) && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${site.seoConfig?.gaMeasurementId || site.seoConfig?.googleAdsId}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${site.seoConfig?.gaMeasurementId ? `gtag('config','${site.seoConfig.gaMeasurementId}',{send_page_view:true});` : ''}${site.seoConfig?.googleAdsId ? `gtag('config','${site.seoConfig.googleAdsId}');` : ''}`,
              }}
            />
          </>
        )}
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-52GB7SVS"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <SiteProvider site={site}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
          <EmailPopup />
          <SocialProofToast />
          <CookieConsent />
          {/* <ExitIntentPopup /> — paused temporarily */}
        </SiteProvider>
        {/* Google Analytics + Ads Conversion Tracking - Dynamic per site */}
        <GoogleAnalytics
          measurementId={site.seoConfig?.gaMeasurementId}
          googleAdsId={site.seoConfig?.googleAdsId}
        />
        {/* Meta Pixel - Dynamic per site */}
        <MetaPixel pixelId={site.seoConfig?.metaPixelId} />
      </body>
    </html>
  );
}
