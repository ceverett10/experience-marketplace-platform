'use client';

import { useState } from 'react';
import { TermsModal } from '@/components/checkout/TermsModal';

interface BookingQuestion {
  id: string;
  label: string;
  type: string;
  dataType: string;
  dataFormat?: string;
  answerValue?: string;
  isRequired: boolean;
  autoCompleteValue?: string;
  availableOptions?: Array<{ label: string; value: string }>;
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
  isResubmission?: boolean;
  siteName?: string;
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
  questionAnswers?: Array<{
    questionId: string;
    value: string;
  }>;
}

/**
 * Check if a question will be auto-filled by the lead person data
 * (the backend label-matching handles these from firstName/lastName/email/phone)
 */
function isAutoFillableQuestion(label: string): boolean {
  const l = label.toLowerCase();
  return (
    (l.includes('first') && l.includes('name')) ||
    (l.includes('last') && l.includes('name')) ||
    l.includes('surname') ||
    l.includes('family name') ||
    l === 'name' ||
    l.includes('full name') ||
    l.includes('email') ||
    l.includes('phone') ||
    /\btel(ephone)?\b/.test(l) ||
    l.includes('mobile')
  );
}

/** Get unanswered questions that can't be auto-filled from lead person data */
function getAdditionalQuestions(
  questions: BookingQuestion[],
  skipAutoFillable: boolean
): BookingQuestion[] {
  return questions.filter(
    (q) => !q.answerValue && (!skipAutoFillable || !isAutoFillableQuestion(q.label))
  );
}

/** Render a single dynamic question field based on its type */
function DynamicQuestionField({
  question,
  value,
  onChange,
  error,
}: {
  question: BookingQuestion;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const inputClass = `w-full rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
    error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-teal-500 focus:ring-teal-500'
  }`;

  const type = question.type?.toUpperCase() ?? 'TEXT';

  const renderField = () => {
    switch (type) {
      case 'BOOLEAN':
        return (
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </span>
          </label>
        );

      case 'SELECT':
        return (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`${inputClass} bg-white`}
            >
              <option value="">Select...</option>
              {(question.availableOptions ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        );

      case 'MULTISELECT': {
        const selectedValues = value ? value.split(',').filter(Boolean) : [];
        return (
          <>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <div className="space-y-2">
              {(question.availableOptions ?? []).map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(opt.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedValues, opt.value]
                        : selectedValues.filter((v) => v !== opt.value);
                      onChange(next.join(','));
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </>
        );
      }

      case 'TEXTAREA':
        return (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder={question.label}
            />
          </>
        );

      case 'DATE':
        return (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
            />
          </>
        );

      case 'NUMBER':
        return (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
              placeholder={question.label}
            />
          </>
        );

      default: {
        // TEXT, EMAIL, PHONE, or unknown
        const inputType = type === 'EMAIL' ? 'email' : type === 'PHONE' ? 'tel' : 'text';
        return (
          <>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {question.label}
              {question.isRequired && <span className="text-red-500"> *</span>}
            </label>
            <input
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
              placeholder={question.label}
            />
          </>
        );
      }
    }
  };

  return (
    <div data-testid={`dynamic-question-${question.id}`}>
      {renderField()}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function QuestionsForm({
  bookingQuestions,
  availabilities,
  onSubmit,
  isSubmitting,
  primaryColor = '#0d9488',
  totalPrice,
  isResubmission = false,
}: QuestionsFormProps) {
  const totalGuests = availabilities.reduce(
    (sum, avail) => sum + (avail.personList?.nodes.length ?? 0),
    0
  );

  // Lead person details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  // Dynamic question answers (keyed by question ID)
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, string>>({});

  // Collapsible person sections
  const [expandedPersons, setExpandedPersons] = useState<Record<string, boolean>>({});

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setDynamicAnswer = (questionId: string, value: string) => {
    setDynamicAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const togglePerson = (personId: string) => {
    setExpandedPersons((prev) => ({ ...prev, [personId]: !prev[personId] }));
  };

  // Compute additional questions at each level (unanswered, not auto-fillable)
  const additionalBookingQuestions = getAdditionalQuestions(bookingQuestions, true);

  const availabilityQuestionSections = availabilities
    .map((avail) => ({
      availability: avail,
      questions: getAdditionalQuestions(avail.questionList?.nodes ?? [], true),
    }))
    .filter((s) => s.questions.length > 0);

  const personQuestionSections = availabilities.flatMap((avail) =>
    (avail.personList?.nodes ?? [])
      .filter((person) => !person.isQuestionsComplete)
      .map((person, index) => ({
        person,
        guestIndex: index,
        productName: avail.product?.name,
        // For person questions, don't skip auto-fillable for non-lead guests
        // (lead guest auto-fill from our form, but additional guests may need their own details)
        questions: getAdditionalQuestions(
          person.questionList?.nodes ?? [],
          index === 0 // skip auto-fillable only for lead guest (index 0)
        ),
      }))
      .filter((s) => s.questions.length > 0)
  );

  const hasAdditionalQuestions =
    additionalBookingQuestions.length > 0 ||
    availabilityQuestionSections.length > 0 ||
    personQuestionSections.length > 0;

  // Gather all dynamic questions for validation
  const allDynamicQuestions = [
    ...additionalBookingQuestions,
    ...availabilityQuestionSections.flatMap((s) => s.questions),
    ...personQuestionSections.flatMap((s) => s.questions),
  ];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) newErrors['firstName'] = 'First name is required';
    if (!lastName.trim()) newErrors['lastName'] = 'Last name is required';
    if (!email) {
      newErrors['email'] = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors['email'] = 'Invalid email address';
    }
    if (!phone.trim()) newErrors['phone'] = 'Phone number is required';

    // Validate dynamic questions
    for (const question of allDynamicQuestions) {
      if (!question.isRequired) continue;
      const answer = dynamicAnswers[question.id];
      const type = question.type?.toUpperCase() ?? 'TEXT';

      if (type === 'BOOLEAN') {
        if (answer !== 'true') {
          newErrors[`q_${question.id}`] = 'This acknowledgment is required';
        }
      } else if (!answer || !answer.trim()) {
        newErrors[`q_${question.id}`] = `${question.label} is required`;
      }
    }

    if (!termsAccepted) newErrors['terms'] = 'You must accept the terms and conditions';

    setErrors(newErrors);

    const errorKeys = Object.keys(newErrors);
    if (errorKeys.length > 0) {
      // Scroll to first error field
      const firstKey = errorKeys[0]!;
      const testIdMap: Record<string, string> = {
        firstName: 'lead-first-name',
        lastName: 'lead-last-name',
        email: 'lead-email',
        phone: 'lead-phone',
        terms: 'terms-checkbox',
      };
      const testId =
        testIdMap[firstKey] ??
        (firstKey.startsWith('q_') ? `dynamic-question-${firstKey.slice(2)}` : undefined);
      if (testId) {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    return errorKeys.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const fullPhone = `${phoneCountryCode} ${phone}`.trim();

    // Build question answers from dynamic fields
    const questionAnswers = Object.entries(dynamicAnswers)
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([questionId, value]) => ({ questionId, value }));

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
      questionAnswers,
    };

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" data-testid="questions-form">
      {/* Lead Person Details */}
      <div className="rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-6 text-lg font-semibold" style={{ color: primaryColor }}>
          Your Details
        </h2>

        <div className="space-y-4">
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
              autoComplete="given-name"
              data-testid="lead-first-name"
            />
            {errors['firstName'] && (
              <p className="mt-1 text-xs text-red-500">{errors['firstName']}</p>
            )}
          </div>

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
              autoComplete="family-name"
              data-testid="lead-last-name"
            />
            {errors['lastName'] && (
              <p className="mt-1 text-xs text-red-500">{errors['lastName']}</p>
            )}
          </div>

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
              autoComplete="email"
              data-testid="lead-email"
            />
            {errors['email'] && <p className="mt-1 text-xs text-red-500">{errors['email']}</p>}
          </div>

          <div className="flex gap-2">
            <select
              value={phoneCountryCode}
              onChange={(e) => setPhoneCountryCode(e.target.value)}
              className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoComplete="tel-country-code"
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
              autoComplete="tel-national"
              data-testid="lead-phone"
            />
          </div>
          {errors['phone'] && <p className="-mt-2 text-xs text-red-500">{errors['phone']}</p>}
        </div>
      </div>

      {/* Additional Booking-Level Questions */}
      {additionalBookingQuestions.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold" style={{ color: primaryColor }}>
            Additional Information
          </h2>
          <div className="space-y-4">
            {additionalBookingQuestions.map((question) => (
              <DynamicQuestionField
                key={question.id}
                question={question}
                value={dynamicAnswers[question.id] ?? ''}
                onChange={(val) => setDynamicAnswer(question.id, val)}
                error={errors[`q_${question.id}`]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Availability-Level Questions (per experience) */}
      {availabilityQuestionSections.map(({ availability, questions }) => (
        <div key={availability.id} className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold" style={{ color: primaryColor }}>
            {availability.product?.name ?? 'Experience'} — Additional Questions
          </h2>
          <div className="space-y-4">
            {questions.map((question) => (
              <DynamicQuestionField
                key={question.id}
                question={question}
                value={dynamicAnswers[question.id] ?? ''}
                onChange={(val) => setDynamicAnswer(question.id, val)}
                error={errors[`q_${question.id}`]}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Per-Person Questions */}
      {personQuestionSections.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold" style={{ color: primaryColor }}>
            Guest Details
          </h2>
          <div className="space-y-3">
            {personQuestionSections.map(({ person, guestIndex, questions }) => {
              const isExpanded = expandedPersons[person.id] ?? true; // default open
              const label = person.pricingCategoryLabel ?? `Guest ${guestIndex + 1}`;

              return (
                <div
                  key={person.id}
                  className="rounded-lg border border-gray-200"
                  data-testid={`person-section-${person.id}`}
                >
                  <button
                    type="button"
                    onClick={() => togglePerson(person.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {label}
                      {guestIndex === 0 && (
                        <span className="ml-2 text-xs text-gray-500">(Lead guest)</span>
                      )}
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="space-y-4 border-t border-gray-200 px-4 py-4">
                      {questions.map((question) => (
                        <DynamicQuestionField
                          key={question.id}
                          question={question}
                          value={dynamicAnswers[question.id] ?? ''}
                          onChange={(val) => setDynamicAnswer(question.id, val)}
                          error={errors[`q_${question.id}`]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Terms and Total */}
      <div className="rounded-xl bg-white p-6 shadow-lg">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            data-testid="terms-checkbox"
          />
          <span className="text-sm text-gray-700">
            I accept the{' '}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="underline hover:text-gray-900"
            >
              Terms and Conditions
            </button>
          </span>
        </label>
        {errors['terms'] && <p className="mt-2 text-xs text-red-500">{errors['terms']}</p>}

        {/* Total Cost Display */}
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <span className="text-lg font-semibold text-gray-900">Total cost:</span>
          <span className="text-xl font-bold" style={{ color: primaryColor }}>
            {totalPrice ?? '-'}
          </span>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400">Payment processed by Holibob Ltd</p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
        data-testid="submit-questions"
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
        ) : isResubmission ? (
          'Submit Answers'
        ) : (
          'Proceed to Payment'
        )}
      </button>

      {/* Guest count info */}
      {totalGuests > 1 && !hasAdditionalQuestions && (
        <p className="text-center text-sm text-gray-500">
          Booking for {totalGuests} guests. Lead person details will be used for the booking.
        </p>
      )}

      {/* Terms and Conditions Modal */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        primaryColor={primaryColor}
      />
    </form>
  );
}
