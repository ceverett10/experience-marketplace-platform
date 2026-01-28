import Link from 'next/link';
import { ExperienceCard } from './ExperienceCard';
import type { ExperienceListItem } from '@/lib/holibob';

interface FeaturedExperiencesProps {
  title?: string;
  subtitle?: string;
  experiences: ExperienceListItem[];
  viewAllHref?: string;
  variant?: 'grid' | 'featured';
}

export function FeaturedExperiences({
  title = 'Popular Experiences',
  subtitle,
  experiences,
  viewAllHref = '/experiences',
  variant = 'grid',
}: FeaturedExperiencesProps) {
  if (experiences.length === 0) {
    return null;
  }

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h2>
            {subtitle && <p className="mt-2 text-base text-gray-600">{subtitle}</p>}
          </div>
          <Link
            href={viewAllHref}
            className="hidden text-sm font-medium text-indigo-600 hover:text-indigo-500 sm:block"
          >
            View all <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        {/* Experiences Grid */}
        {variant === 'featured' ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {experiences.slice(0, 6).map((experience) => (
              <ExperienceCard key={experience.id} experience={experience} variant="featured" />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {experiences.slice(0, 8).map((experience) => (
              <ExperienceCard key={experience.id} experience={experience} variant="default" />
            ))}
          </div>
        )}

        {/* Mobile View All */}
        <div className="mt-8 sm:hidden">
          <Link
            href={viewAllHref}
            className="block w-full rounded-lg border border-gray-300 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View all experiences
          </Link>
        </div>
      </div>
    </section>
  );
}
