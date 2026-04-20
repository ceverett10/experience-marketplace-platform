'use client';

interface FormSectionProps {
  title: string;
  sectionNumber: number;
  isActive: boolean;
  isComplete: boolean;
  completeSummary?: string;
  onEdit?: () => void;
  primaryColor?: string;
  children: React.ReactNode;
}

/**
 * Collapsible form section for progressive disclosure checkout.
 * - Active: shows children with clear focus
 * - Complete: shows compact summary with edit button; children remain in DOM but hidden
 * - Upcoming: shows muted title; children remain in DOM but hidden
 *
 * Children are always rendered (never unmounted) so that form fields stay in the DOM
 * for accessibility, test queries, and browser autofill.
 */
export function FormSection({
  title,
  sectionNumber,
  isActive,
  isComplete,
  completeSummary,
  onEdit,
  primaryColor = '#0d9488',
  children,
}: FormSectionProps) {
  if (isComplete && !isActive) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <svg
                className="h-3.5 w-3.5 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{title}</p>
              {completeSummary && <p className="text-sm text-gray-500">{completeSummary}</p>}
            </div>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-sm font-medium"
              style={{ color: primaryColor }}
            >
              Edit
            </button>
          )}
        </div>
        <div className="hidden">{children}</div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs font-medium text-gray-400">
            {sectionNumber}
          </div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
        </div>
        <div className="hidden">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border-2 bg-white p-5 shadow-sm"
      style={{ borderColor: primaryColor }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {sectionNumber}
        </div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}
