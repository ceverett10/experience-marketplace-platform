import Image from 'next/image';

type Variant =
  | 'header' // compact inline, sits next to site logo on desktop
  | 'widget' // medium, paired with other trust signals in booking widget / checkout
  | 'stacked'; // centered "Powered by" over logo — louder trust mark

interface PoweredByHolibobProps {
  variant?: Variant;
  className?: string;
}

export function PoweredByHolibob({ variant = 'widget', className = '' }: PoweredByHolibobProps) {
  if (variant === 'header') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-gray-500 ${className}`}
      >
        Powered by
        <Image
          src="/holibob-logo.svg"
          alt="Holibob"
          width={64}
          height={15}
          className="h-3.5 w-auto"
        />
      </span>
    );
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Powered by
        </span>
        <Image
          src="/holibob-logo.svg"
          alt="Holibob"
          width={120}
          height={28}
          className="h-6 w-auto"
        />
      </div>
    );
  }

  // widget (default)
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500 ${className}`}
    >
      Powered by
      <Image src="/holibob-logo.svg" alt="Holibob" width={72} height={17} className="h-4 w-auto" />
    </span>
  );
}
