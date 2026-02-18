'use client';

import Image from 'next/image';
import { useSite, useBrand } from '@/lib/site-context';
import { ProductDiscoverySearch } from '@/components/search/ProductDiscoverySearch';
import { UnsplashAttribution } from '@/components/common/UnsplashAttribution';
import { BLUR_PLACEHOLDER, optimizeUnsplashUrl, shouldSkipOptimization } from '@/lib/image-utils';

interface HeroProps {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  backgroundImageAttribution?: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  };
  isPpc?: boolean;
  experienceCount?: number;
}

export function Hero({
  title,
  subtitle,
  backgroundImage,
  backgroundImageAttribution,
  isPpc,
  experienceCount,
}: HeroProps) {
  const site = useSite();
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#0d9488';

  const heroTitle = isPpc
    ? `Book ${site.name} — Free Cancellation`
    : (title ?? `Discover Unique Experiences`);
  const heroSubtitle = isPpc
    ? `${experienceCount ? `${experienceCount.toLocaleString()} experiences available` : 'Experiences available'} · Instant confirmation`
    : (subtitle ??
      brand?.tagline ??
      (site.description !== heroTitle ? site.description : null) ??
      'Find and book unforgettable tours, activities, and attractions worldwide');

  return (
    <section className="relative">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        {backgroundImage ? (
          <Image
            src={
              shouldSkipOptimization(backgroundImage)
                ? backgroundImage
                : optimizeUnsplashUrl(backgroundImage, 1280, 40)
            }
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-ken-burns object-cover"
            placeholder="blur"
            blurDataURL={BLUR_PLACEHOLDER}
            unoptimized={shouldSkipOptimization(backgroundImage)}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `
                linear-gradient(135deg, ${brand?.primaryColor ?? '#1e3a5f'} 0%, ${brand?.secondaryColor ?? '#2d6a9f'} 40%, #0d9488 70%, #065f46 100%)
              `,
              backgroundSize: '400% 400%',
              animation: 'heroGradient 15s ease infinite',
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/50" />
        {/* Decorative travel-themed pattern overlay */}
        {!backgroundImage && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        )}
        {/* Unsplash Attribution - REQUIRED by Unsplash API Guidelines */}
        {backgroundImage && backgroundImageAttribution && (
          <UnsplashAttribution
            photographerName={backgroundImageAttribution.photographerName}
            photographerUrl={backgroundImageAttribution.photographerUrl}
            unsplashUrl={backgroundImageAttribution.unsplashUrl}
            variant="overlay-compact"
            className="bottom-24 left-auto right-2"
          />
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 md:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1
            className="hero-animate-title font-display text-2xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
          >
            {heroTitle}
          </h1>
          <p
            className="hero-animate-subtitle mx-auto mt-6 max-w-xl text-base leading-7 text-white/90 sm:text-lg sm:leading-8"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {heroSubtitle}
          </p>

          {/* PPC: Action CTA + trust badges | Organic: Search widget */}
          {isPpc ? (
            <div className="hero-animate-search mt-10">
              <a
                href="/experiences"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-lg font-bold text-white shadow-lg transition-transform hover:scale-105"
                style={{ backgroundColor: primaryColor }}
              >
                Browse Experiences
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </a>
              <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs text-white/90 sm:gap-6 sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Free Cancellation</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Best Price Guarantee</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Secure Payment</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="hero-animate-search mt-10">
              <div className="search-glow rounded-2xl md:rounded-full">
                <ProductDiscoverySearch variant="hero" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Decorative wave transition */}
      <div className="absolute -bottom-1 left-0 right-0">
        <svg
          viewBox="0 0 1440 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block w-full"
          preserveAspectRatio="none"
        >
          <path d="M0 40C240 70 480 80 720 60C960 40 1200 10 1440 30V80H0V40Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}
