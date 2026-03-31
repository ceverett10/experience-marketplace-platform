interface DestinationContextProps {
  city: string;
  blurb: string;
  tags?: string[];
  primaryColor: string;
}

/**
 * Destination Context Block
 *
 * Renders a "Why [City]" section with a short blurb and contextual tag pills.
 * Only shown when destinationBlurb is populated (AI-generated or manual).
 */
export function DestinationContext({ city, blurb, tags, primaryColor }: DestinationContextProps) {
  return (
    <section className="bg-gray-50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: `var(--supplier-brand, ${primaryColor})` }}
          >
            Why {city}
          </p>
          <p className="mt-4 text-lg leading-relaxed text-gray-700">{blurb}</p>

          {tags && tags.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: `var(--supplier-brand-light, ${primaryColor}15)`,
                    color: `var(--supplier-brand-text, ${primaryColor})`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
