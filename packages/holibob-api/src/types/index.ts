import { z } from 'zod';

// ============================================================================
// PRODUCT DISCOVERY TYPES
// ============================================================================

export const ProductFilterSchema = z.object({
  // Location (Where)
  placeIds: z.array(z.string()).optional(),
  geoPoint: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radiusKm: z.number().optional(),
    })
    .optional(),

  // Time (When)
  dateFrom: z.string().optional(), // ISO date
  dateTo: z.string().optional(),
  timeFrom: z.string().optional(), // HH:mm
  timeTo: z.string().optional(),

  // Guests (Who)
  adults: z.number().int().min(0).optional(),
  children: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),

  // Categories (What)
  categoryIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),

  // Pricing
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  currency: z.string().default('GBP'),

  // Other filters
  duration: z
    .object({
      min: z.number().optional(), // minutes
      max: z.number().optional(),
    })
    .optional(),
  languages: z.array(z.string()).optional(),
  accessibility: z.array(z.string()).optional(),
});

export type ProductFilter = z.infer<typeof ProductFilterSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),

  // Pricing
  priceFrom: z.number(),
  priceTo: z.number().optional(),
  currency: z.string(),

  // Media
  imageUrl: z.string().optional(),
  images: z.array(
    z.object({
      url: z.string(),
      alt: z.string().optional(),
      isPrimary: z.boolean().optional(),
    })
  ).optional(),

  // Details
  duration: z.number().optional(), // minutes
  durationText: z.string().optional(),

  // Location
  location: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),

  // Categorization
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ).optional(),
  tags: z.array(z.string()).optional(),

  // Ratings
  rating: z.number().optional(),
  reviewCount: z.number().optional(),

  // Availability
  hasInstantConfirmation: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),

  // Holibob-specific
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export const ProductListResponseSchema = z.object({
  products: z.array(ProductSchema),
  totalCount: z.number(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    startCursor: z.string().optional(),
    endCursor: z.string().optional(),
  }),
});

export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

// ============================================================================
// AVAILABILITY TYPES
// ============================================================================

export const AvailabilityOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Pricing
  price: z.number(),
  originalPrice: z.number().optional(),
  currency: z.string(),

  // Time
  date: z.string(), // ISO date
  startTime: z.string().optional(), // HH:mm
  endTime: z.string().optional(),

  // Capacity
  maxCapacity: z.number().optional(),
  remainingCapacity: z.number().optional(),

  // Guests
  guestTypes: z.array(
    z.object({
      id: z.string(),
      name: z.string(), // Adult, Child, etc.
      minAge: z.number().optional(),
      maxAge: z.number().optional(),
      price: z.number(),
    })
  ).optional(),

  // Extras
  extras: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      isRequired: z.boolean().optional(),
    })
  ).optional(),

  // Booking
  cutoffMinutes: z.number().optional(),
  instantConfirmation: z.boolean().optional(),
});

export type AvailabilityOption = z.infer<typeof AvailabilityOptionSchema>;

export const AvailabilityResponseSchema = z.object({
  productId: z.string(),
  options: z.array(AvailabilityOptionSchema),
});

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

// ============================================================================
// BOOKING TYPES
// ============================================================================

export const GuestSchema = z.object({
  guestTypeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(), // ISO date
});

export type Guest = z.infer<typeof GuestSchema>;

export const BookingItemSchema = z.object({
  availabilityId: z.string(),
  productId: z.string(),
  productName: z.string(),
  date: z.string(),
  startTime: z.string().optional(),
  guests: z.array(GuestSchema),
  extras: z.array(
    z.object({
      extraId: z.string(),
      quantity: z.number(),
    })
  ).optional(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  currency: z.string(),
});

export type BookingItem = z.infer<typeof BookingItemSchema>;

export const BookingSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),

  // Items
  items: z.array(BookingItemSchema),

  // Totals
  subtotal: z.number(),
  fees: z.number().optional(),
  taxes: z.number().optional(),
  total: z.number(),
  currency: z.string(),

  // Customer
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),

  // Payment
  paymentStatus: z.enum(['PENDING', 'PAID', 'REFUNDED']).optional(),
  paymentIntentId: z.string().optional(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
  confirmedAt: z.string().optional(),
});

export type Booking = z.infer<typeof BookingSchema>;

export const CreateBookingInputSchema = z.object({
  siteId: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  items: z.array(
    z.object({
      availabilityId: z.string(),
      guests: z.array(GuestSchema),
      extras: z.array(
        z.object({
          extraId: z.string(),
          quantity: z.number(),
        })
      ).optional(),
    })
  ),
});

export type CreateBookingInput = z.infer<typeof CreateBookingInputSchema>;

// ============================================================================
// API CLIENT CONFIG
// ============================================================================

export interface HolibobClientConfig {
  apiUrl: string;
  partnerId: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
}

export interface HolibobApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface HolibobApiResponse<T> {
  data?: T;
  errors?: HolibobApiError[];
}
