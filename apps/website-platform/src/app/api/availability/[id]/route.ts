/**
 * Availability Detail API Route
 *
 * GET /api/availability/[id] - Get availability details with options
 * POST /api/availability/[id] - Set options for availability
 *
 * This implements Holibob Look-to-Book Steps 4-5:
 * - Step 4: Discover and set availability options (time slots, variants)
 * - Step 5: Get and set pricing categories
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

// Schema for setting options
const SetOptionsSchema = z.object({
  optionList: z.array(z.object({
    id: z.string(),
    value: z.string(),
  })).optional(),
  pricingCategoryList: z.array(z.object({
    id: z.string(),
    units: z.number().int().min(0),
  })).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/availability/[id] - Get availability details
 * Query params:
 * - includePricing: Set to 'true' to include pricing categories
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: availabilityId } = await params;
    const { searchParams } = new URL(request.url);
    const includePricing = searchParams.get('includePricing') === 'true';

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch availability details
    let availability;
    if (includePricing) {
      availability = await client.getAvailabilityPricing(availabilityId);
    } else {
      availability = await client.getAvailability(availabilityId);
    }

    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Get availability detail error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Availability not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch availability details' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/availability/[id] - Set options or pricing for availability
 * Body:
 * - optionList: Array of { id, value } to set options
 * - pricingCategoryList: Array of { id, units } to set pricing
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: availabilityId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = SetOptionsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { optionList, pricingCategoryList } = validationResult.data;

    // Ensure at least one is provided
    if (!optionList?.length && !pricingCategoryList?.length) {
      return NextResponse.json(
        { error: 'Either optionList or pricingCategoryList must be provided' },
        { status: 400 }
      );
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    let availability;

    // Set options if provided
    if (optionList?.length) {
      availability = await client.setAvailabilityOptions(availabilityId, { optionList });
    }

    // Set pricing if provided
    if (pricingCategoryList?.length) {
      availability = await client.setAvailabilityPricing(availabilityId, pricingCategoryList);
    }

    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Set availability options error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Availability not found' },
          { status: 404 }
        );
      }
      if (error.message.includes('invalid')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to set availability options' },
      { status: 500 }
    );
  }
}
