'use client';

import { useSite, useBrand } from '@/lib/site-context';
import { SearchBar } from '@/components/search/SearchBar';

interface HeroProps {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
}

export function Hero({ title, subtitle, backgroundImage }: HeroProps) {
  const site = useSite();
  const brand = useBrand();

  const heroTitle = title ?? `Discover Unique Experiences`;
  const heroSubtitle =
    subtitle ??
    brand?.tagline ??
    site.description ??
    'Find and book unforgettable tours, activities, and adventures in your destination.';

  return (
    <section className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        {backgroundImage ? (
          <img
            src={backgroundImage}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${brand?.primaryColor ?? '#6366f1'} 0%, ${brand?.secondaryColor ?? '#8b5cf6'} 100%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {heroTitle}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-white/90">
            {heroSubtitle}
          </p>

          {/* Search Bar */}
          <div className="mt-10">
            <SearchBar variant="hero" />
          </div>

          {/* Quick Links */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <span className="text-sm text-white/70">Popular:</span>
            {['Tours', 'Day Trips', 'Food & Drink', 'Attractions'].map(
              (category) => (
                <a
                  key={category}
                  href={`/experiences?category=${category.toLowerCase().replace(/ & /g, '-')}`}
                  className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                >
                  {category}
                </a>
              )
            )}
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
