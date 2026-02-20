'use client';

import { useBrand } from '@/lib/site-context';

export interface GuestType {
  id: string;
  name: string;
  description?: string;
  minAge?: number;
  maxAge?: number;
  price: number;
  currency: string;
}

export interface GuestCount {
  typeId: string;
  count: number;
}

interface GuestSelectorProps {
  guestTypes?: GuestType[];
  guestCounts: GuestCount[];
  onGuestCountChange: (typeId: string, count: number) => void;
  maxGuests?: number;
  minGuests?: number;
}

// Default guest types if none provided
const DEFAULT_GUEST_TYPES: GuestType[] = [
  {
    id: 'adult',
    name: 'Adults',
    description: 'Ages 18+',
    minAge: 18,
    price: 0, // Price handled at availability level
    currency: 'GBP',
  },
  {
    id: 'child',
    name: 'Children',
    description: 'Ages 3-17',
    minAge: 3,
    maxAge: 17,
    price: 0,
    currency: 'GBP',
  },
  {
    id: 'infant',
    name: 'Infants',
    description: 'Ages 0-2',
    minAge: 0,
    maxAge: 2,
    price: 0,
    currency: 'GBP',
  },
];

export function GuestSelector({
  guestTypes = DEFAULT_GUEST_TYPES,
  guestCounts,
  onGuestCountChange,
  maxGuests = 20,
  minGuests = 1,
}: GuestSelectorProps) {
  const brand = useBrand();

  // Calculate total guests
  const totalGuests = guestCounts.reduce((sum, gc) => sum + gc.count, 0);

  // Get count for a specific guest type
  const getCount = (typeId: string): number => {
    return guestCounts.find((gc) => gc.typeId === typeId)?.count ?? 0;
  };

  // Handle increment/decrement
  const handleIncrement = (typeId: string) => {
    if (totalGuests < maxGuests) {
      onGuestCountChange(typeId, getCount(typeId) + 1);
    }
  };

  const handleDecrement = (typeId: string) => {
    const currentCount = getCount(typeId);
    if (currentCount > 0) {
      // Check if this would bring total below minimum
      const newTotal = totalGuests - 1;
      if (
        newTotal >= minGuests ||
        (typeId !== 'adult' && guestCounts.some((gc) => gc.typeId === 'adult' && gc.count > 0))
      ) {
        onGuestCountChange(typeId, currentCount - 1);
      }
    }
  };

  // Format price for display
  const formatPrice = (amount: number, currency: string): string => {
    if (amount === 0) return 'Included';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-gray-700">Guests</h4>

      <div className="space-y-3">
        {guestTypes.map((guestType) => {
          const count = getCount(guestType.id);
          const isAdult = guestType.id === 'adult';
          const canDecrement = count > 0 && (totalGuests > minGuests || !isAdult);
          const canIncrement = totalGuests < maxGuests;

          return (
            <div
              key={guestType.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900">{guestType.name}</div>
                {guestType.description && (
                  <div className="text-sm text-gray-500">{guestType.description}</div>
                )}
                {guestType.price > 0 && (
                  <div className="text-sm text-gray-600">
                    {formatPrice(guestType.price, guestType.currency)} each
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDecrement(guestType.id)}
                  disabled={!canDecrement}
                  className={`
                    flex h-11 w-11 items-center justify-center rounded-full border
                    transition-colors
                    ${
                      canDecrement
                        ? 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                        : 'cursor-not-allowed border-gray-200 text-gray-300'
                    }
                  `}
                  aria-label={`Decrease ${guestType.name} count`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                  </svg>
                </button>

                <span className="w-8 text-center text-base font-medium text-gray-900">{count}</span>

                <button
                  type="button"
                  onClick={() => handleIncrement(guestType.id)}
                  disabled={!canIncrement}
                  className={`
                    flex h-11 w-11 items-center justify-center rounded-full border
                    transition-colors
                    ${
                      canIncrement
                        ? 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                        : 'cursor-not-allowed border-gray-200 text-gray-300'
                    }
                  `}
                  aria-label={`Increase ${guestType.name} count`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total guests indicator */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
        <span className="text-gray-600">Total guests</span>
        <span
          className={`font-medium ${totalGuests >= maxGuests ? 'text-orange-600' : 'text-gray-900'}`}
        >
          {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
          {totalGuests >= maxGuests && <span className="ml-1 text-xs text-orange-600">(max)</span>}
        </span>
      </div>

      {/* Warning if no adults */}
      {!guestCounts.some((gc) => gc.typeId === 'adult' && gc.count > 0) && totalGuests > 0 && (
        <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          <svg
            className="mr-2 inline h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          At least one adult is required for this booking
        </div>
      )}
    </div>
  );
}

// Companion component for collecting guest details
export interface GuestDetails {
  guestTypeId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
}

interface GuestDetailsFormProps {
  guestCounts: GuestCount[];
  guestTypes?: GuestType[];
  guestDetails: GuestDetails[];
  onGuestDetailsChange: (details: GuestDetails[]) => void;
  requireEmail?: boolean;
  requirePhone?: boolean;
}

export function GuestDetailsForm({
  guestCounts,
  guestTypes = DEFAULT_GUEST_TYPES,
  guestDetails,
  onGuestDetailsChange,
  requireEmail = false,
  requirePhone = false,
}: GuestDetailsFormProps) {
  const brand = useBrand();

  // Generate guest form entries based on counts
  const guestEntries: { typeId: string; typeName: string; index: number }[] = [];
  guestCounts.forEach((gc) => {
    const guestType = guestTypes.find((gt) => gt.id === gc.typeId);
    for (let i = 0; i < gc.count; i++) {
      guestEntries.push({
        typeId: gc.typeId,
        typeName: guestType?.name ?? gc.typeId,
        index: i,
      });
    }
  });

  // Update a specific guest's details
  const updateGuestDetail = (entryIndex: number, field: keyof GuestDetails, value: string) => {
    const newDetails = [...guestDetails];
    if (!newDetails[entryIndex]) {
      newDetails[entryIndex] = {
        guestTypeId: guestEntries[entryIndex]?.typeId ?? 'adult',
        firstName: '',
        lastName: '',
      };
    }
    newDetails[entryIndex] = {
      ...newDetails[entryIndex],
      [field]: value,
    };
    onGuestDetailsChange(newDetails);
  };

  // Get detail for a specific guest
  const getDetail = (entryIndex: number): GuestDetails => {
    return (
      guestDetails[entryIndex] ?? {
        guestTypeId: guestEntries[entryIndex]?.typeId ?? 'adult',
        firstName: '',
        lastName: '',
      }
    );
  };

  if (guestEntries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h4 className="text-sm font-medium text-gray-700">Guest Details</h4>

      {guestEntries.map((entry, index) => {
        const detail = getDetail(index);
        const isFirstAdult = entry.typeId === 'adult' && entry.index === 0;

        return (
          <div
            key={`${entry.typeId}-${entry.index}`}
            className="rounded-lg border border-gray-200 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <h5 className="font-medium text-gray-900">
                {entry.typeName} {entry.index + 1}
              </h5>
              {isFirstAdult && <span className="text-xs text-gray-500">Lead guest</span>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`guest-${index}-firstName`}
                  className="block text-sm font-medium text-gray-700"
                >
                  First name *
                </label>
                <input
                  type="text"
                  id={`guest-${index}-firstName`}
                  value={detail.firstName}
                  onChange={(e) => updateGuestDetail(index, 'firstName', e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                  style={
                    { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                  }
                />
              </div>

              <div>
                <label
                  htmlFor={`guest-${index}-lastName`}
                  className="block text-sm font-medium text-gray-700"
                >
                  Last name *
                </label>
                <input
                  type="text"
                  id={`guest-${index}-lastName`}
                  value={detail.lastName}
                  onChange={(e) => updateGuestDetail(index, 'lastName', e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                  style={
                    { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                  }
                />
              </div>

              {(isFirstAdult || requireEmail) && (
                <div>
                  <label
                    htmlFor={`guest-${index}-email`}
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email {isFirstAdult ? '*' : ''}
                  </label>
                  <input
                    type="email"
                    id={`guest-${index}-email`}
                    value={detail.email ?? ''}
                    onChange={(e) => updateGuestDetail(index, 'email', e.target.value)}
                    required={isFirstAdult}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                    style={
                      { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                    }
                  />
                </div>
              )}

              {(isFirstAdult || requirePhone) && (
                <div>
                  <label
                    htmlFor={`guest-${index}-phone`}
                    className="block text-sm font-medium text-gray-700"
                  >
                    Phone
                  </label>
                  <input
                    type="tel"
                    id={`guest-${index}-phone`}
                    value={detail.phone ?? ''}
                    onChange={(e) => updateGuestDetail(index, 'phone', e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                    style={
                      { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                    }
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
