'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

interface FormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
};

interface ContactFormProps {
  primaryColor?: string;
}

export function ContactForm({ primaryColor = '#6366f1' }: ContactFormProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };

      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
      setForm(INITIAL_FORM);
    } catch {
      setError('Failed to send message. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <div className="mb-2 text-2xl">&#10003;</div>
        <h3 className="mb-1 text-lg font-semibold text-green-800">Message Sent</h3>
        <p className="text-green-700">
          Thank you for getting in touch. We&apos;ll get back to you within 24-48 hours.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-4 text-sm text-green-600 underline hover:text-green-800"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Name */}
        <div>
          <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Your name"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="contact-email" className="mb-1 block text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            required
            maxLength={320}
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="your@email.com"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Phone */}
        <div>
          <label htmlFor="contact-phone" className="mb-1 block text-sm font-medium text-gray-700">
            Phone <span className="text-sm font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            maxLength={30}
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="+44 ..."
          />
        </div>

        {/* Subject */}
        <div>
          <label htmlFor="contact-subject" className="mb-1 block text-sm font-medium text-gray-700">
            Subject <span className="text-red-500">*</span>
          </label>
          <select
            id="contact-subject"
            required
            value={form.subject}
            onChange={(e) => handleChange('subject', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select a topic</option>
            <option value="Booking enquiry">Booking enquiry</option>
            <option value="Cancellation or refund">Cancellation or refund</option>
            <option value="Experience question">Experience question</option>
            <option value="Partnership enquiry">Partnership enquiry</option>
            <option value="Feedback">Feedback</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Message */}
      <div>
        <label htmlFor="contact-message" className="mb-1 block text-sm font-medium text-gray-700">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="contact-message"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          value={form.message}
          onChange={(e) => handleChange('message', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="How can we help?"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{ backgroundColor: isSubmitting ? undefined : primaryColor }}
        className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
      >
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>

      <p className="text-xs text-gray-500">
        By submitting this form, you agree to our{' '}
        <a href="/privacy" className="underline hover:text-gray-700">
          Privacy Policy
        </a>
        . We&apos;ll only use your details to respond to your enquiry.
      </p>
    </form>
  );
}
