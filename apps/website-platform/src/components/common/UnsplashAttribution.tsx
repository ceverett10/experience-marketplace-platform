/**
 * Unsplash Attribution Component
 *
 * REQUIRED BY UNSPLASH API GUIDELINES:
 * "Each time you or your Developer App displays an Image, your Developer App
 * must attribute Unsplash, the Unsplash photographer, and contain a link back
 * to the photographer's Unsplash profile."
 *
 * This component displays the required attribution for Unsplash images.
 * It should be displayed whenever an Unsplash image is shown.
 */

interface UnsplashAttributionProps {
  photographerName: string;
  photographerUrl: string;
  unsplashUrl?: string;
  variant?: 'overlay' | 'overlay-compact' | 'inline' | 'minimal';
  className?: string;
}

export function UnsplashAttribution({
  photographerName,
  photographerUrl,
  unsplashUrl = 'https://unsplash.com?utm_source=experience_marketplace&utm_medium=referral',
  variant = 'overlay',
  className = '',
}: UnsplashAttributionProps) {
  if (variant === 'minimal') {
    // Minimal version - just photographer name with link
    return (
      <span className={`text-xs text-gray-500 ${className}`}>
        Photo by{' '}
        <a
          href={photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700"
        >
          {photographerName}
        </a>{' '}
        on{' '}
        <a
          href={unsplashUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-700"
        >
          Unsplash
        </a>
      </span>
    );
  }

  if (variant === 'inline') {
    // Inline version - for use below images
    return (
      <p className={`mt-1 text-xs text-gray-500 ${className}`}>
        Photo by{' '}
        <a
          href={photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-600 hover:text-gray-800 hover:underline"
        >
          {photographerName}
        </a>{' '}
        on{' '}
        <a
          href={unsplashUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-gray-600 hover:text-gray-800 hover:underline"
        >
          Unsplash
        </a>
      </p>
    );
  }

  // Compact overlay version - smaller for tight spaces
  if (variant === 'overlay-compact') {
    return (
      <div
        className={`absolute bottom-1 left-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm ${className}`}
      >
        <a
          href={photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {photographerName}
        </a>
        {' / '}
        <a
          href={unsplashUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Unsplash
        </a>
      </div>
    );
  }

  // Overlay version - positioned inside image container
  return (
    <div
      className={`absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-sm ${className}`}
    >
      Photo by{' '}
      <a
        href={photographerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:underline"
      >
        {photographerName}
      </a>{' '}
      on{' '}
      <a
        href={unsplashUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:underline"
      >
        Unsplash
      </a>
    </div>
  );
}

/**
 * Hook-style utility for formatting attribution text
 * Use this if you need to display attribution in a custom format
 */
export function formatUnsplashAttribution(
  photographerName: string,
  photographerUrl: string,
  unsplashUrl = 'https://unsplash.com?utm_source=experience_marketplace&utm_medium=referral'
): {
  text: string;
  links: { photographer: string; unsplash: string };
} {
  return {
    text: `Photo by ${photographerName} on Unsplash`,
    links: {
      photographer: photographerUrl,
      unsplash: unsplashUrl,
    },
  };
}
