/**
 * Contact Form API Route
 *
 * POST /api/contact - Submit a contact form message
 *
 * Stores messages in the ContactMessage table for review.
 * Messages are associated with the site/microsite they were submitted from.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Please enter a valid email address').max(320),
  phone: z.string().max(30).optional(),
  subject: z.string().min(1, 'Subject is required').max(300),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
});

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const validationResult = ContactFormSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0]?.message ?? 'Validation failed' },
        { status: 400 }
      );
    }

    const { name, email, phone, subject, message } = validationResult.data;

    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost';
    const site = await getSiteFromHostname(host);

    const isMicrosite = !!site.micrositeContext;

    await prisma.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        subject: subject.trim(),
        message: message.trim(),
        domain: host,
        siteId: isMicrosite ? undefined : site.id !== 'default' ? site.id : undefined,
        micrositeId: isMicrosite ? site.micrositeContext?.micrositeId : undefined,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your message. We will get back to you within 24-48 hours.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contact form error:', error);

    return NextResponse.json(
      { error: 'Failed to send message. Please try again.' },
      { status: 500 }
    );
  }
}
