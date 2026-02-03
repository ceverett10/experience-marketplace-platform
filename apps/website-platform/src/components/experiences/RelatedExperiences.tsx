'use client';

import { ExperienceCard } from './ExperienceCard';
import type { ExperienceListItem } from '@/lib/holibob';

interface RelatedExperiencesProps {
  experiences: ExperienceListItem[];
  title?: string;
}

export function RelatedExperiences({
  experiences,
  title = 'You might also like',
}: RelatedExperiencesProps) {
  if (experiences.length === 0) return null;

  return (
    <section className="border-t border-gray-200 bg-gray-50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {experiences.slice(0, 4).map((experience) => (
            <ExperienceCard key={experience.id} experience={experience} />
          ))}
        </div>
      </div>
    </section>
  );
}
