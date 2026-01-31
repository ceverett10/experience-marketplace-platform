'use client';

import { useState } from 'react';

interface BookingQuestion {
  id: string;
  label: string;
  type: string;
  dataType: string;
  dataFormat?: string;
  answerValue?: string;
  isRequired: boolean;
  autoCompleteValue?: string;
}

interface BookingPerson {
  id: string;
  pricingCategoryLabel?: string;
  isQuestionsComplete?: boolean;
  questionList?: {
    nodes: BookingQuestion[];
  };
}

interface BookingAvailability {
  id: string;
  date: string;
  product?: {
    name: string;
  };
  questionList?: {
    nodes: BookingQuestion[];
  };
  personList?: {
    nodes: BookingPerson[];
  };
}

interface QuestionsFormProps {
  bookingId: string;
  bookingQuestions: BookingQuestion[];
  availabilities: BookingAvailability[];
  onSubmit: (data: GuestData) => Promise<void>;
  isSubmitting: boolean;
  primaryColor?: string;
  totalPrice?: string;
}

export interface GuestData {
  customerEmail: string;
  customerPhone: string;
  guests: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    isLeadGuest: boolean;
  }>;
  termsAccepted: boolean;
  availabilityAnswers?: Array<{
    questionId: string;
    value: string;
  }>;
}

export function QuestionsForm({
  bookingQuestions,
  availabilities,
  onSubmit,
  isSubmitting,
  primaryColor = '#0d9488',
  totalPrice,
}: QuestionsFormProps) {
  // Extract total number of persons for display
  const totalGuests = availabilities.reduce(
    (sum, avail) => sum + (avail.personList?.nodes.length ?? 0),
    0
  );

  // Simple form state - just lead person details (like Classictic)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Availability-level questions (e.g., risk acceptance waivers)
  const availabilityQuestions = availabilities.flatMap((avail) =>
    (avail.questionList?.nodes ?? []).filter((q) => !q.answerValue)
  );
  const [availabilityAnswers, setAvailabilityAnswers] = useState<Record<string, boolean>>({});

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) {
      newErrors['firstName'] = 'First name is required';
    }
    if (!lastName.trim()) {
      newErrors['lastName'] = 'Last name is required';
    }
    if (!email) {
      newErrors['email'] = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors['email'] = 'Invalid email address';
    }
    if (!phone.trim()) {
      newErrors['phone'] = 'Phone number is required';
    }
    // Check availability questions (e.g., risk waivers)
    for (const question of availabilityQuestions) {
      if (question.isRequired && !availabilityAnswers[question.id]) {
        newErrors[`avail_${question.id}`] = 'This acknowledgment is required';
      }
    }
    if (!termsAccepted) {
      newErrors['terms'] = 'You must accept the terms and conditions';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Build guest data - use lead person details for all guests (API will auto-fill)
    const fullPhone = `${phoneCountryCode} ${phone}`.trim();

    // Build availability answers for submission
    const availAnswers = Object.entries(availabilityAnswers)
      .filter(([_, accepted]) => accepted)
      .map(([questionId]) => ({
        questionId,
        value: 'true', // Boolean questions expect string 'true'
      }));

    const data: GuestData = {
      customerEmail: email,
      customerPhone: fullPhone,
      guests: availabilities.flatMap((avail) =>
        (avail.personList?.nodes ?? []).map((_, index) => ({
          firstName,
          lastName,
          email: index === 0 ? email : undefined,
          phone: index === 0 ? fullPhone : undefined,
          isLeadGuest: index === 0,
        }))
      ),
      termsAccepted,
      availabilityAnswers: availAnswers,
    };

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Lead Person Details - simplified like Classictic */}
      <div className="rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-6 text-lg font-semibold" style={{ color: primaryColor }}>
          Lead Person Details
        </h2>

        <div className="space-y-4">
          {/* First Name */}
          <div>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={`w-full rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                errors['firstName']
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-teal-500 focus:ring-teal-500'
              }`}
              placeholder="First name *"
            />
            {errors['firstName'] && (
              <p className="mt-1 text-xs text-red-500">{errors['firstName']}</p>
            )}
          </div>

          {/* Last Name */}
          <div>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={`w-full rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                errors['lastName']
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-teal-500 focus:ring-teal-500'
              }`}
              placeholder="Last name *"
            />
            {errors['lastName'] && (
              <p className="mt-1 text-xs text-red-500">{errors['lastName']}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                errors['email']
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-teal-500 focus:ring-teal-500'
              }`}
              placeholder="Email Address *"
            />
            {errors['email'] && <p className="mt-1 text-xs text-red-500">{errors['email']}</p>}
          </div>

          {/* Phone with Country Code */}
          <div className="flex gap-2">
            <select
              value={phoneCountryCode}
              onChange={(e) => setPhoneCountryCode(e.target.value)}
              className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="+44">+44</option>
              <option value="+1">+1</option>
              <option value="+33">+33</option>
              <option value="+34">+34</option>
              <option value="+39">+39</option>
              <option value="+49">+49</option>
              <option value="+31">+31</option>
              <option value="+32">+32</option>
              <option value="+41">+41</option>
              <option value="+43">+43</option>
              <option value="+351">+351</option>
              <option value="+353">+353</option>
              <option value="+61">+61</option>
              <option value="+64">+64</option>
              <option value="+81">+81</option>
              <option value="+82">+82</option>
              <option value="+86">+86</option>
              <option value="+91">+91</option>
            </select>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
                errors['phone']
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-teal-500 focus:ring-teal-500'
              }`}
              placeholder="Phone Number *"
            />
          </div>
          {errors['phone'] && <p className="-mt-2 text-xs text-red-500">{errors['phone']}</p>}
        </div>
      </div>

      {/* Completion Section - Terms and Conditions */}
      <div className="rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold" style={{ color: primaryColor }}>
          Completion
        </h2>

        {/* Availability-level questions (risk waivers, etc.) */}
        {availabilityQuestions.length > 0 && (
          <div className="mb-4 space-y-3">
            {availabilityQuestions.map((question) => (
              <div key={question.id}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availabilityAnswers[question.id] ?? false}
                    onChange={(e) =>
                      setAvailabilityAnswers((prev) => ({
                        ...prev,
                        [question.id]: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">
                    {question.label}
                    {question.isRequired && <span className="text-red-500"> *</span>}
                  </span>
                </label>
                {errors[`avail_${question.id}`] && (
                  <p className="mt-1 ml-7 text-xs text-red-500">{errors[`avail_${question.id}`]}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mb-4 text-sm text-gray-600">
          You just need to accept Holibob{' '}
          <a
            href="https://holibob.tech/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-900"
          >
            terms and conditions
          </a>{' '}
          to continue.
        </p>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700">I accept the Terms and Conditions.</span>
        </label>
        {errors['terms'] && <p className="mt-2 text-xs text-red-500">{errors['terms']}</p>}

        {/* Total Cost Display */}
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <span className="text-lg font-semibold text-gray-900">Total cost:</span>
          <span className="text-xl font-bold" style={{ color: primaryColor }}>
            {totalPrice ?? '-'}
          </span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Processing...
          </span>
        ) : (
          'Continue to Payment'
        )}
      </button>

      {/* Guest count info */}
      {totalGuests > 1 && (
        <p className="text-center text-sm text-gray-500">
          Booking for {totalGuests} guests. Lead person details will be used for the booking.
        </p>
      )}
    </form>
  );
}
