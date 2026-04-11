'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useBrand } from '@/lib/site-context';

interface GroupEnquiryForm {
  company: string;
  name: string;
  email: string;
  phone: string;
  groupSize: string;
  preferredDates: string;
  budgetRange: string;
  experienceType: string;
  requirements: string;
}

const INITIAL_FORM: GroupEnquiryForm = {
  company: '',
  name: '',
  email: '',
  phone: '',
  groupSize: '',
  preferredDates: '',
  budgetRange: '',
  experienceType: '',
  requirements: '',
};

const BUDGET_OPTIONS = [
  { value: 'Under £500', label: 'Under £500' },
  { value: '£500-£1000', label: '£500 - £1,000' },
  { value: '£1000-£2500', label: '£1,000 - £2,500' },
  { value: '£2500-£5000', label: '£2,500 - £5,000' },
  { value: '£5000+', label: '£5,000+' },
];

const EXPERIENCE_TYPE_OPTIONS = [
  { value: 'Team Building', label: 'Team Building' },
  { value: 'Food & Drink', label: 'Food & Drink' },
  { value: 'Adventure', label: 'Adventure' },
  { value: 'Cultural', label: 'Cultural' },
  { value: 'Wellness', label: 'Wellness' },
  { value: 'Other', label: 'Other' },
];

const TRUST_SIGNALS = [
  {
    title: 'Dedicated group coordinator',
    description: 'A single point of contact to manage every detail of your group experience.',
  },
  {
    title: 'Custom proposals within 24h',
    description: 'Receive a tailored proposal with pricing and options within one business day.',
  },
  {
    title: 'Flexible payment options',
    description:
      'Split payments, invoicing, and deposit schemes available for groups of all sizes.',
  },
];

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm' +
  ' transition-colors focus:border-blue-500 focus:outline-none focus:ring-1' +
  ' focus:ring-blue-500';

export default function GroupEnquiryPage() {
  const brand = useBrand();
  const primaryColor = brand?.primaryColor ?? '#6366f1';

  const [form, setForm] = useState<GroupEnquiryForm>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof GroupEnquiryForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const buildSubject = (): string => {
    const org = form.company.trim() || 'Individual';
    return `Group Enquiry: ${org} - ${form.groupSize} people`;
  };

  const buildMessage = (): string => {
    const lines = [
      `Group Size: ${form.groupSize}`,
      `Preferred Dates: ${form.preferredDates || 'Not specified'}`,
      `Budget Range: ${form.budgetRange || 'Not specified'}`,
      `Experience Type: ${form.experienceType || 'Not specified'}`,
      `Company/Organisation: ${form.company || 'Not specified'}`,
      '',
      'Special Requirements:',
      form.requirements || 'None',
    ];
    return lines.join('\n');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          subject: buildSubject(),
          message: buildMessage(),
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
      setForm(INITIAL_FORM);
    } catch {
      setError('Failed to send enquiry. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <div className="mb-2 text-4xl">&#10003;</div>
          <h2 className="mb-2 text-xl font-semibold text-green-800">Enquiry Received</h2>
          <p className="text-green-700">
            Thank you for your group enquiry. Our dedicated group coordinator will be in touch
            within 24 hours with a custom proposal.
          </p>
          <button
            type="button"
            onClick={() => setSuccess(false)}
            className="mt-6 text-sm text-green-600 underline hover:text-green-800"
          >
            Submit another enquiry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero Section */}
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Plan a Group Experience
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-600">
          Whether you are organising a corporate team day, a private celebration, or a large group
          outing, we will create a bespoke experience tailored to your needs.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h2 className="mb-6 text-xl font-semibold text-gray-900">Tell us about your group</h2>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* Contact Details Row */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="group-name" className="mb-1 block text-sm font-medium text-gray-700">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                id="group-name"
                type="text"
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your full name"
              />
            </div>

            <div>
              <label htmlFor="group-email" className="mb-1 block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="group-email"
                type="email"
                required
                maxLength={320}
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={INPUT_CLASS}
                placeholder="your@email.com"
              />
            </div>
          </div>

          {/* Company and Phone Row */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="group-company"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Company / Organisation{' '}
                <span className="text-sm font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="group-company"
                type="text"
                maxLength={200}
                value={form.company}
                onChange={(e) => handleChange('company', e.target.value)}
                className={INPUT_CLASS}
                placeholder="Your company or organisation"
              />
            </div>

            <div>
              <label htmlFor="group-phone" className="mb-1 block text-sm font-medium text-gray-700">
                Phone <span className="text-sm font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="group-phone"
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className={INPUT_CLASS}
                placeholder="+44 ..."
              />
            </div>
          </div>

          {/* Group Size and Preferred Dates Row */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="group-size" className="mb-1 block text-sm font-medium text-gray-700">
                Group Size <span className="text-red-500">*</span>
              </label>
              <input
                id="group-size"
                type="number"
                required
                min={2}
                max={10000}
                value={form.groupSize}
                onChange={(e) => handleChange('groupSize', e.target.value)}
                className={INPUT_CLASS}
                placeholder="Number of attendees"
              />
            </div>

            <div>
              <label htmlFor="group-dates" className="mb-1 block text-sm font-medium text-gray-700">
                Preferred Dates
              </label>
              <input
                id="group-dates"
                type="text"
                maxLength={200}
                value={form.preferredDates}
                onChange={(e) => handleChange('preferredDates', e.target.value)}
                className={INPUT_CLASS}
                placeholder="e.g. March 2026, any Friday in April"
              />
            </div>
          </div>

          {/* Budget and Experience Type Row */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="group-budget"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Budget Range
              </label>
              <select
                id="group-budget"
                value={form.budgetRange}
                onChange={(e) => handleChange('budgetRange', e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Select a range</option>
                {BUDGET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="group-type" className="mb-1 block text-sm font-medium text-gray-700">
                Experience Type
              </label>
              <select
                id="group-type"
                value={form.experienceType}
                onChange={(e) => handleChange('experienceType', e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Select a type</option>
                {EXPERIENCE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Special Requirements */}
          <div>
            <label
              htmlFor="group-requirements"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Special Requirements
            </label>
            <textarea
              id="group-requirements"
              maxLength={5000}
              rows={4}
              value={form.requirements}
              onChange={(e) => handleChange('requirements', e.target.value)}
              className={INPUT_CLASS}
              placeholder="Dietary needs, accessibility requirements, specific activities, or anything else we should know"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              backgroundColor: isSubmitting ? undefined : primaryColor,
            }}
            className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
          >
            {isSubmitting ? 'Sending...' : 'Submit Group Enquiry'}
          </button>

          <p className="text-xs text-gray-500">
            By submitting this form, you agree to our{' '}
            <a href="/privacy" className="underline hover:text-gray-700">
              Privacy Policy
            </a>
            . We&apos;ll only use your details to respond to your enquiry.
          </p>
        </div>
      </form>

      {/* Trust Signals */}
      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {TRUST_SIGNALS.map((signal) => (
          <div
            key={signal.title}
            className="rounded-lg border border-gray-100 bg-gray-50 p-5 text-center"
          >
            <h3 className="mb-2 text-sm font-semibold text-gray-900">{signal.title}</h3>
            <p className="text-sm text-gray-600">{signal.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
