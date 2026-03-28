'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useWishlist } from '@/hooks/useWishlist';
import { useBrand } from '@/lib/site-context';
import { BLUR_PLACEHOLDER } from '@/lib/image-utils';

export default function WishlistPage() {
  const { items, removeFromWishlist, clearWishlist } = useWishlist();
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#0F766E';
  const [copied, setCopied] = useState(false);

  const handleShareWishlist = useCallback(async () => {
    // Build a shareable URL with product IDs
    const ids = items.map((i) => i.id).join(',');
    const shareUrl = `${window.location.origin}/wishlist?shared=${encodeURIComponent(ids)}`;
    const shareText = `Check out my wishlist — ${items.length} experience${items.length === 1 ? '' : 's'} I'd love to try!`;

    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Wishlist', text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled — fall through to clipboard
      }
    }

    // Desktop fallback: copy link
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Older browser fallback
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              My Wishlist
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {items.length === 0
                ? 'No saved experiences yet'
                : `${items.length} saved ${items.length === 1 ? 'experience' : 'experiences'}`}
            </p>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Share wishlist button */}
              <button
                onClick={handleShareWishlist}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                  />
                </svg>
                {copied ? 'Link copied!' : 'Share list'}
              </button>
              <button
                onClick={clearWishlist}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No saved experiences</h3>
            <p className="mt-2 text-sm text-gray-500">
              Tap the heart icon on any experience to save it here for later.
            </p>
            <Link
              href="/experiences"
              className="mt-6 inline-flex items-center rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              Browse experiences
            </Link>
          </div>
        )}

        {/* Wishlist Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white transition-shadow hover:shadow-lg"
              >
                <Link href={`/experiences/${item.slug}`}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-200">
                    <Image
                      src={item.imageUrl || '/placeholder-experience.jpg'}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      placeholder="blur"
                      blurDataURL={BLUR_PLACEHOLDER}
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-teal-700">
                      {item.title}
                    </h3>
                    <div className="mt-2 flex items-baseline justify-between">
                      {item.price.amount > 0 && (
                        <div>
                          <span className="text-xs text-gray-500">From </span>
                          <span className="text-base font-bold" style={{ color: primaryColor }}>
                            {item.price.formatted}
                          </span>
                          <span className="text-[10px] text-gray-400"> per adult</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Remove button */}
                <button
                  onClick={() => removeFromWishlist(item.id)}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:scale-110"
                  aria-label="Remove from wishlist"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
