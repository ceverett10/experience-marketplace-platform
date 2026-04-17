'use client';

interface StepConfig {
  key: string;
  label: string;
}

interface BookingStepperProps {
  steps: StepConfig[];
  currentStepKey: string;
  completedStepKeys: Set<string>;
  primaryColor?: string;
}

export function BookingStepper({
  steps,
  currentStepKey,
  completedStepKeys,
  primaryColor = '#0d9488',
}: BookingStepperProps) {
  const currentIdx = steps.findIndex((s) => s.key === currentStepKey);

  return (
    <div className="flex flex-col gap-0" data-testid="progress-steps">
      {steps.map((step, idx) => {
        const isCompleted = completedStepKeys.has(step.key);
        const isCurrent = step.key === currentStepKey;
        const isUpcoming = idx > currentIdx && !isCompleted;

        return (
          <div key={step.key} className="flex items-start gap-3">
            {/* Vertical line + circle */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isCompleted
                    ? 'text-white'
                    : isCurrent
                      ? 'text-white'
                      : 'border-2 border-gray-300 text-gray-400'
                }`}
                style={isCompleted || isCurrent ? { backgroundColor: primaryColor } : undefined}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="3"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-0.5 ${isCompleted ? '' : 'bg-gray-200'}`}
                  style={{
                    height: '24px',
                    backgroundColor: isCompleted ? primaryColor : undefined,
                  }}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={`pt-1 text-sm ${
                isCurrent
                  ? 'font-semibold text-gray-900'
                  : isCompleted
                    ? 'font-medium text-gray-700'
                    : isUpcoming
                      ? 'text-gray-400'
                      : 'text-gray-500'
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
