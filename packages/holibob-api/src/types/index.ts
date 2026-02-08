import { z } from 'zod';

// ============================================================================
// PRODUCT DISCOVERY TYPES (Step 1 & 2)
// ============================================================================

export const ProductFilterSchema = z.object({
  // Location (Where) - Product Discovery uses freeText
  freeText: z.string().optional(), // Free text search for location (e.g., "London, England")
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

  // Search & Categories (What)
  searchTerm: z.string().optional(), // Free text search for activities
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

export const ProductImageSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  altText: z.string().optional(),
});

export type ProductImage = z.infer<typeof ProductImageSchema>;

export const ProductCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

export type ProductCategory = z.infer<typeof ProductCategorySchema>;

export const ProductLocationSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type ProductLocation = z.infer<typeof ProductLocationSchema>;

export const CancellationPolicySchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  cutoffHours: z.number().optional(),
});

export type CancellationPolicy = z.infer<typeof CancellationPolicySchema>;

export const MeetingPointSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  instructions: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type MeetingPoint = z.infer<typeof MeetingPointSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),

  // Pricing (guide price for display - Product Detail)
  guidePrice: z.number().optional(),
  guidePriceFormattedText: z.string().optional(),
  guidePriceCurrency: z.string().optional(),

  // Pricing (Product Discovery API)
  priceFrom: z.number().optional(),
  priceFromFormatted: z.string().optional(),
  priceCurrency: z.string().optional(),
  priceTo: z.number().optional(),
  currency: z.string().optional(),

  // Media
  imageUrl: z.string().optional(),
  primaryImageUrl: z.string().optional(), // Product Discovery API
  imageList: z.array(ProductImageSchema).optional(), // Direct array in Product Detail API
  images: z.array(ProductImageSchema).optional(),

  // Details
  duration: z.number().optional(), // minutes
  maxDuration: z.number().optional(), // Product Discovery API
  durationText: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  importantInfo: z.array(z.string()).optional(),

  // Location
  location: ProductLocationSchema.optional(),

  // Categorization
  categoryList: z
    .object({
      nodes: z.array(ProductCategorySchema),
    })
    .optional(),
  categories: z.array(ProductCategorySchema).optional(),
  tags: z.array(z.string()).optional(),

  // Additional info - legacy cancellation policy is handled in the new format below
  meetingPoint: MeetingPointSchema.optional(),

  // Ratings
  rating: z.number().optional(),
  reviewRating: z.number().optional(), // Product Discovery API
  reviewCount: z.number().optional(),

  // Availability
  hasInstantConfirmation: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),

  // Holibob-specific (legacy fields - use provider instead)
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),

  // Provider (Operator) - the company that provides/operates the experience
  // Note: Holibob Provider type only exposes id and name
  provider: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .optional(),

  // Content list from Product Detail API - contains typed content items
  // Types: INCLUSION, EXCLUSION, HIGHLIGHT, NOTE (additional info), ITINERARY, etc.
  contentList: z
    .object({
      nodes: z.array(
        z.object({
          type: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
        })
      ),
    })
    .optional(),

  // Guide languages from Product Detail API
  guideLanguageList: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string().optional(),
        })
      ),
    })
    .optional(),

  // Place information from Product Detail API
  place: z
    .object({
      cityId: z.string().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),

  // Cancellation policy - can have legacy format (type, description) or new format (penaltyList)
  cancellationPolicy: z
    .object({
      type: z.string().optional(),
      description: z.string().optional(),
      cutoffHours: z.number().optional(),
      penaltyList: z
        .object({
          nodes: z.array(
            z.object({
              formattedText: z.string().optional(),
            })
          ),
        })
        .optional(),
    })
    .optional(),

  // Start place with geo-coordinates and address
  startPlace: z
    .object({
      timeZone: z.string().optional(),
      geoCoordinate: z
        .object({
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        })
        .optional(),
      googlePlaceId: z.string().optional(),
      formattedAddress: z.string().optional(),
      mapImageUrl: z.string().optional(),
    })
    .optional(),

  // Review list with individual reviews
  reviewList: z
    .object({
      recordCount: z.number().optional(),
      nodes: z.array(
        z.object({
          id: z.string().optional(),
          title: z.string().optional(),
          content: z.string().optional(),
          rating: z.number().optional(),
          authorName: z.string().optional(),
          publishedDate: z.string().optional(),
          imageList: z
            .object({
              nodes: z.array(
                z.object({
                  url: z.string().optional(),
                })
              ),
            })
            .optional(),
        })
      ),
    })
    .optional(),
});

export type Product = z.infer<typeof ProductSchema>;

export const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  startCursor: z.string().optional(),
  endCursor: z.string().optional(),
});

export type PageInfo = z.infer<typeof PageInfoSchema>;

export const ProductListResponseSchema = z.object({
  products: z.array(ProductSchema),
  totalCount: z.number(),
  pageInfo: PageInfoSchema,
});

export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

// ============================================================================
// AVAILABILITY TYPES (Step 3 & 4) - Recursive Method with Options
// ============================================================================

/**
 * Option types for availability discovery
 * These come back from availabilityList.optionList and must be answered
 */
export const AvailabilityOptionTypeSchema = z.enum([
  'DATE_RANGE', // START_DATE, END_DATE
  'SINGLE_CHOICE', // Time slots, variants
  'MULTI_CHOICE', // Multiple options
  'NUMBER', // Numeric input
  'TEXT', // Text input
]);

export type AvailabilityOptionType = z.infer<typeof AvailabilityOptionTypeSchema>;

export const AvailabilityOptionDataTypeSchema = z.enum([
  'DATE',
  'TIME',
  'STRING',
  'NUMBER',
  'BOOLEAN',
]);

export type AvailabilityOptionDataType = z.infer<typeof AvailabilityOptionDataTypeSchema>;

/**
 * Available choice for an option (e.g., time slots)
 */
export const AvailableOptionChoiceSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export type AvailableOptionChoice = z.infer<typeof AvailableOptionChoiceSchema>;

/**
 * Option that needs to be answered in availability flow
 */
export const AvailabilityOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().nullable().optional(),
  required: z.boolean().optional(),
  type: AvailabilityOptionTypeSchema.optional(),
  dataType: AvailabilityOptionDataTypeSchema.optional(),
  dataFormat: z.string().optional(), // e.g., "YYYY-MM-DD", "HH:mm"
  availableOptions: z.array(AvailableOptionChoiceSchema).optional(),
  answerValue: z.string().nullable().optional(),
  answerFormattedText: z.string().nullable().optional(),
  errorList: z
    .object({
      nodes: z.array(z.string()),
    })
    .optional(),
});

export type AvailabilityOption = z.infer<typeof AvailabilityOptionSchema>;

/**
 * Input for answering availability options
 */
export const AvailabilityOptionInputSchema = z.object({
  id: z.string(),
  value: z.string(),
});

export type AvailabilityOptionInput = z.infer<typeof AvailabilityOptionInputSchema>;

/**
 * Single availability slot from availabilityList
 */
export const AvailabilitySlotSchema = z.object({
  id: z.string(),
  date: z.string(),
  guidePriceFormattedText: z.string().optional(),
  soldOut: z.boolean().optional(),
});

export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

/**
 * Response from availabilityList query (recursive method)
 */
export const AvailabilityListResponseSchema = z.object({
  sessionId: z.string(),
  nodes: z.array(AvailabilitySlotSchema),
  optionList: z.object({
    nodes: z.array(AvailabilityOptionSchema),
  }),
});

export type AvailabilityListResponse = z.infer<typeof AvailabilityListResponseSchema>;

/**
 * Option list with completion status
 */
export const AvailabilityOptionListSchema = z.object({
  isComplete: z.boolean(),
  nodes: z.array(AvailabilityOptionSchema),
});

export type AvailabilityOptionList = z.infer<typeof AvailabilityOptionListSchema>;

// ============================================================================
// PRICING CATEGORY TYPES (Step 5)
// ============================================================================

/**
 * Price object with gross/net amounts
 */
export const PriceSchema = z.object({
  gross: z.number().optional(),
  net: z.number().optional(),
  grossFormattedText: z.string().optional(),
  netFormattedText: z.string().optional(),
  currency: z.string(),
});

export type Price = z.infer<typeof PriceSchema>;

/**
 * Dependency between pricing categories
 * e.g., "For every 1 Adult, you can add up to 2 Children"
 */
export const PricingCategoryDependencySchema = z.object({
  pricingCategoryId: z.string(),
  multiplier: z.number(),
  explanation: z.string().optional(),
});

export type PricingCategoryDependency = z.infer<typeof PricingCategoryDependencySchema>;

/**
 * Pricing category (Adult, Child, etc.) with constraints
 */
export const PricingCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  minParticipants: z.number().optional(),
  maxParticipants: z.number().optional(),
  maxParticipantsDepends: PricingCategoryDependencySchema.nullable().optional(),
  units: z.number().default(0),
  unitPrice: PriceSchema.optional(),
  totalPrice: PriceSchema.optional(),
});

export type PricingCategory = z.infer<typeof PricingCategorySchema>;

/**
 * Full availability detail with options and pricing
 */
export const AvailabilityDetailSchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string().optional(),
  optionList: AvailabilityOptionListSchema.optional(),
  minParticipants: z.number().optional(),
  maxParticipants: z.number().optional(),
  isValid: z.boolean().optional(),
  totalPrice: PriceSchema.optional(),
  pricingCategoryList: z
    .object({
      nodes: z.array(PricingCategorySchema),
    })
    .optional(),
});

export type AvailabilityDetail = z.infer<typeof AvailabilityDetailSchema>;

/**
 * Input for setting availability options or pricing
 */
export const AvailabilityInputSchema = z.object({
  optionList: z.array(AvailabilityOptionInputSchema).optional(),
  pricingCategoryList: z
    .array(
      z.object({
        id: z.string(),
        units: z.number(),
      })
    )
    .optional(),
});

export type AvailabilityInput = z.infer<typeof AvailabilityInputSchema>;

// ============================================================================
// BOOKING TYPES (Step 6-9)
// ============================================================================

/**
 * Booking states
 */
export const BookingStateSchema = z.enum([
  'OPEN', // Initial state after creation
  'PENDING', // After commit, awaiting supplier confirmation
  'CONFIRMED', // Supplier confirmed
  'CANCELLED', // Cancelled by partner or supplier
  'COMPLETED', // Experience completed
  'REJECTED', // Supplier rejected
]);

export type BookingState = z.infer<typeof BookingStateSchema>;

/**
 * Payment states
 */
export const PaymentStateSchema = z.enum([
  'AWAITING_PAYMENT',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export type PaymentState = z.infer<typeof PaymentStateSchema>;

/**
 * Question types for booking questions
 */
export const QuestionTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'DATE',
  'SELECT',
  'MULTISELECT',
  'BOOLEAN',
  'EMAIL',
  'PHONE',
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/**
 * Booking question (at Booking, Availability, or Person level)
 */
export const BookingQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: QuestionTypeSchema.optional(),
  dataType: AvailabilityOptionDataTypeSchema.optional(),
  dataFormat: z.string().optional(),
  answerValue: z.string().nullable().optional(),
  autoCompleteValue: z.string().nullable().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(AvailableOptionChoiceSchema).optional(),
});

export type BookingQuestion = z.infer<typeof BookingQuestionSchema>;

/**
 * Person in a booking (for per-person questions)
 */
export const BookingPersonSchema = z.object({
  id: z.string(),
  pricingCategoryLabel: z.string().optional(),
  isQuestionsComplete: z.boolean().optional(),
  questionList: z
    .object({
      nodes: z.array(BookingQuestionSchema),
    })
    .optional(),
});

export type BookingPerson = z.infer<typeof BookingPersonSchema>;

/**
 * Availability within a booking
 */
export const BookingAvailabilitySchema = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string().optional(),
  product: z
    .object({
      id: z.string(),
      name: z.string(),
      shortDescription: z.string().optional(),
      imageList: z
        .object({
          nodes: z.array(ProductImageSchema),
        })
        .optional(),
    })
    .optional(),
  totalPrice: PriceSchema.optional(),
  questionList: z
    .object({
      nodes: z.array(BookingQuestionSchema),
    })
    .optional(),
  personList: z
    .object({
      nodes: z.array(BookingPersonSchema),
    })
    .optional(),
});

export type BookingAvailability = z.infer<typeof BookingAvailabilitySchema>;

// ============================================================================
// LEGACY GUEST & BOOKING ITEM (defined here for use in BookingSchema)
// ============================================================================

export const GuestSchema = z.object({
  guestTypeId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

export type Guest = z.infer<typeof GuestSchema>;

/**
 * Legacy booking item (for backwards compatibility with old booking structure)
 */
export const BookingItemSchema = z.object({
  availabilityId: z.string(),
  productId: z.string(),
  productName: z.string(),
  date: z.string(),
  startTime: z.string().optional(),
  guests: z.array(GuestSchema),
  unitPrice: z.number(),
  totalPrice: z.number(),
  currency: z.string(),
});

export type BookingItem = z.infer<typeof BookingItemSchema>;

/**
 * Full booking object
 */
export const BookingSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  state: BookingStateSchema.optional(),

  // Lead passenger
  leadPassengerName: z.string().optional(),
  partnerExternalReference: z.string().optional(),

  // Status flags
  isComplete: z.boolean().optional(),
  isSandboxed: z.boolean().optional(),
  canCommit: z.boolean().optional(),

  // Payment
  paymentState: PaymentStateSchema.optional(),

  // Voucher
  voucherUrl: z.string().optional(),

  // Totals
  totalPrice: PriceSchema.optional(),

  // Questions at booking level
  questionList: z
    .object({
      nodes: z.array(BookingQuestionSchema),
    })
    .optional(),

  // Availabilities (items) in booking
  availabilityList: z
    .object({
      nodes: z.array(BookingAvailabilitySchema),
    })
    .optional(),

  // Timestamps
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  confirmedAt: z.string().optional(),

  // Legacy fields for backwards compatibility
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  items: z.array(BookingItemSchema).optional(),
  subtotal: z.number().optional(),
  fees: z.number().optional(),
  taxes: z.number().optional(),
  total: z.number().optional(),
  currency: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentIntentId: z.string().optional(),
});

export type Booking = z.infer<typeof BookingSchema>;

/**
 * Input for creating a booking
 */
export const BookingCreateInputSchema = z.object({
  consumerTripId: z.string().optional(),
  partnerExternalReference: z.string().optional(),
  autoFillQuestions: z.boolean().optional(), // STRONGLY RECOMMENDED: true
  paymentType: z.enum(['ON_ACCOUNT', 'CREDIT_CARD']).optional(),
  siteId: z.string().optional(), // Legacy
});

export type BookingCreateInput = z.infer<typeof BookingCreateInputSchema>;

/**
 * Input for adding availability to booking
 * Holibob API uses BookingAddAvailabilityInputType with:
 * - bookingSelector: BookingSelector! (identifies the booking)
 * - id: String! (the availability ID)
 */
export const BookingAddAvailabilityInputSchema = z.object({
  bookingSelector: z.object({
    id: z.string().optional(),
    code: z.string().optional(),
  }),
  id: z.string(), // availability ID
});

export type BookingAddAvailabilityInput = z.infer<typeof BookingAddAvailabilityInputSchema>;

/**
 * Input for answering a single booking question
 * Note: Uses questionId (not id) per Holibob API documentation
 */
export const BookingQuestionAnswerSchema = z.object({
  questionId: z.string(),
  value: z.string(),
});

export type BookingQuestionAnswer = z.infer<typeof BookingQuestionAnswerSchema>;

/**
 * Input for updating booking and answering questions
 * Per Holibob API documentation:
 * - leadPassengerName: Name of lead passenger
 * - reference: Partner external reference
 * - answerList: Array of question answers (questionId + value)
 */
export const BookingInputSchema = z.object({
  leadPassengerName: z.string().optional(),
  reference: z.string().optional(),
  answerList: z.array(BookingQuestionAnswerSchema).optional(),
});

export type BookingInput = z.infer<typeof BookingInputSchema>;

/**
 * Selector for booking by ID or code
 */
export const BookingSelectorInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
});

export type BookingSelectorInput = z.infer<typeof BookingSelectorInputSchema>;

// ============================================================================
// STRIPE PAYMENT INTENT TYPES
// ============================================================================

/**
 * Stripe Payment Intent from Holibob
 * Used when paymentType: REQUIRED to collect payment before commit
 */
export const StripePaymentIntentSchema = z.object({
  id: z.string(),
  amount: z.number(),
  clientSecret: z.string(),
  apiKey: z.string(),
  createdAt: z.string().optional(),
});

export type StripePaymentIntent = z.infer<typeof StripePaymentIntentSchema>;

// ============================================================================
// BOOKING LIST TYPES
// ============================================================================

export const BookingListFilterInputSchema = z.object({
  consumerTripId: z.string().optional(),
  consumerId: z.string().optional(),
  state: BookingStateSchema.optional(),
});

export type BookingListFilterInput = z.infer<typeof BookingListFilterInputSchema>;

export const BookingListResponseSchema = z.object({
  recordCount: z.number(),
  nodes: z.array(BookingSchema),
});

export type BookingListResponse = z.infer<typeof BookingListResponseSchema>;

// ============================================================================
// PROVIDER (OPERATOR) TYPES - For Microsite System
// ============================================================================

/**
 * Provider represents an operator/supplier that provides experiences
 *
 * NOTE: Holibob API's Provider type only exposes id and name fields.
 * Additional provider info (productCount, rating, etc.) must be derived
 * from product data or other sources.
 *
 * NOTE: providerList endpoint requires elevated permissions most partners
 * don't have. Discover providers via productList instead.
 */
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Response from providerList query
 * NOTE: No pagination support - returns all providers if accessible
 * NOTE: Most partners don't have access to this endpoint
 */
export const ProviderListResponseSchema = z.object({
  recordCount: z.number(),
  nodes: z.array(ProviderSchema),
});

export type ProviderListResponse = z.infer<typeof ProviderListResponseSchema>;

/**
 * Response from productList query
 * Different from ProductListResponse (which is from Product Discovery)
 * NOTE: productList doesn't support pagination - returns all matching products
 */
export const ProductListByProviderResponseSchema = z.object({
  recordCount: z.number(),
  nodes: z.array(ProductSchema),
});

export type ProductListByProviderResponse = z.infer<typeof ProductListByProviderResponseSchema>;

/**
 * Provider node from providerTree in productList
 * This is the RECOMMENDED approach for discovering all providers.
 *
 * providerTree returns:
 * - id: Provider ID
 * - label: Provider name
 * - count: Number of products for this provider
 */
export const ProviderTreeNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number(),
});

export type ProviderTreeNode = z.infer<typeof ProviderTreeNodeSchema>;

/**
 * Provider with product count
 * Extended version of Provider that includes productCount from providerTree
 */
export const ProviderWithCountSchema = z.object({
  id: z.string(),
  name: z.string(),
  productCount: z.number(),
});

export type ProviderWithCount = z.infer<typeof ProviderWithCountSchema>;

/**
 * Response from providerTree query
 * Returns all providers with their product counts in a single query
 */
export const ProviderTreeResponseSchema = z.object({
  recordCount: z.number(),
  nodes: z.array(ProviderTreeNodeSchema),
});

export type ProviderTreeResponse = z.infer<typeof ProviderTreeResponseSchema>;

// ============================================================================
// CATEGORY & PLACE TYPES
// ============================================================================

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  productCount: z.number().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

export const PlaceTypeSchema = z.enum(['COUNTRY', 'REGION', 'CITY', 'DISTRICT', 'POI']);

export type PlaceType = z.infer<typeof PlaceTypeSchema>;

export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  type: PlaceTypeSchema.optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  imageUrl: z.string().optional(),
  productCount: z.number().optional(),
});

export type Place = z.infer<typeof PlaceSchema>;

// ============================================================================
// API CLIENT CONFIG
// ============================================================================

export interface HolibobClientConfig {
  apiUrl: string;
  partnerId: string;
  apiKey: string;
  apiSecret?: string; // For HMAC signature authentication
  timeout?: number;
  retries?: number;
  sandbox?: boolean;
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

// ============================================================================
// LEGACY TYPE EXPORTS (for backwards compatibility)
// ============================================================================

export const CreateBookingInputSchema = BookingCreateInputSchema;
export type CreateBookingInput = BookingCreateInput;

// Legacy availability response (simplified)
export const AvailabilityResponseSchema = z.object({
  productId: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.number(),
      originalPrice: z.number().optional(),
      currency: z.string(),
      date: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      maxCapacity: z.number().optional(),
      remainingCapacity: z.number().optional(),
      guestTypes: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            minAge: z.number().optional(),
            maxAge: z.number().optional(),
            price: z.number(),
          })
        )
        .optional(),
      extras: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            price: z.number(),
            isRequired: z.boolean().optional(),
          })
        )
        .optional(),
      cutoffMinutes: z.number().optional(),
      instantConfirmation: z.boolean().optional(),
    })
  ),
});

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
