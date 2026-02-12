import { gql } from 'graphql-request';

// ============================================================================
// PRODUCT DISCOVERY QUERIES (Holibob Look-to-Book Step 1 & 2)
// ============================================================================

/**
 * Suggestions Query - For real-time search suggestions
 * Returns destination suggestions, tags, and search terms as user types
 * Matches Holibob Hub behavior with recommendedDestinationList
 */
export const SUGGESTIONS_QUERY = gql`
  query ProductDiscoverySuggestions(
    $where: ProductDiscoveryWhere
    $when: ProductDiscoveryWhen
    $who: ProductDiscoveryWho
    $what: ProductDiscoveryWhat
  ) {
    productDiscovery(where: $where, when: $when, who: $who, what: $what) {
      selectedDestination {
        id
        name
      }
      recommendedDestinationList(count: 5) {
        nodes {
          id
          name
        }
      }
      recommendedTagList {
        nodes {
          id
          name
        }
      }
      recommendedSearchTermList {
        nodes {
          searchTerm
        }
      }
    }
  }
`;

/**
 * Step 1: Discover Products using Product Discovery API
 * Arguments: where (freeText location), when (dates), who (travelers), what (search/filters)
 * Output: destination, recommendedTagList, recommendedSearchTermList, recommendedProductList
 *
 * Note: The API uses separate arguments, NOT a single input object
 * Pagination: Use seenProductIdList to get new products (Holibob doesn't support traditional pagination)
 */
export const PRODUCT_LIST_QUERY = gql`
  query ProductDiscovery(
    $where: ProductDiscoveryWhere
    $when: ProductDiscoveryWhen
    $who: ProductDiscoveryWho
    $what: ProductDiscoveryWhat
    $seenProductIdList: [ID!]
    $productCount: Int
  ) {
    productDiscovery(where: $where, when: $when, who: $who, what: $what) {
      selectedDestination {
        id
        name
      }
      recommendedTagList {
        nodes {
          id
          name
        }
      }
      recommendedSearchTermList {
        nodes {
          searchTerm
        }
      }
      recommendedProductList(count: $productCount, seenProductIdList: $seenProductIdList) {
        nodes {
          id
          name
        }
      }
    }
  }
`;

/**
 * Step 2: Display Product Details
 * Retrieve detailed product information
 *
 * NOTE: Holibob API uses String! for product ID (not ID!)
 * NOTE: The query endpoint is `productDetail` (not `product`)
 * Content is retrieved via contentList which returns nodes with type/name/description.
 * Types include: INCLUSION, EXCLUSION, HIGHLIGHT, NOTE (additional info), ITINERARY, etc.
 */
export const PRODUCT_DETAIL_QUERY = gql`
  query ProductDetail($id: String!) {
    productDetail(id: $id) {
      id
      name
      description
      guidePrice
      guidePriceFormattedText
      guidePriceCurrency
      imageList {
        id
        url
      }
      maxDuration
      reviewRating
      reviewCount
      contentList {
        nodes {
          type
          name
          description
        }
      }
      guideLanguageList {
        nodes {
          id
          name
        }
      }
      cancellationPolicy {
        penaltyList {
          nodes {
            formattedText
          }
        }
      }
      startPlace {
        timeZone
        geoCoordinate {
          latitude
          longitude
        }
        googlePlaceId
        formattedAddress
        mapImageUrl
      }
      reviewList {
        recordCount
        nodes {
          id
          title
          content
          rating
          authorName
          publishedDate
          imageList {
            nodes {
              url
            }
          }
        }
      }
      provider {
        id
        name
      }
    }
  }
`;

// ============================================================================
// AVAILABILITY QUERIES (Holibob Look-to-Book Step 3 & 4)
// ============================================================================

/**
 * Step 3: Request Availability List
 * Can use either:
 * - filter: { startDate, endDate } for direct date-based lookup (simple)
 * - sessionId + optionList for recursive method
 */
export const AVAILABILITY_LIST_QUERY = gql`
  query AvailabilityList(
    $productId: String!
    $filter: AvailabilityListFilter
    $sessionId: ID
    $optionList: [AvailabilityListOptionListItemInput]
  ) {
    availabilityList(
      productId: $productId
      filter: $filter
      sessionId: $sessionId
      optionList: $optionList
    ) {
      sessionId
      recordCount
      nodes {
        id
        date
        guidePriceFormattedText
        soldOut
      }
      optionList {
        nodes {
          id
          label
          value
          required
          type
          dataType
          errorList {
            nodes
          }
        }
      }
    }
  }
`;

/**
 * Step 4: Discover and Set Availability Options
 * Use availability query to discover options (time slots, variants, etc.)
 * and pricing categories. Must iterate until optionList.isComplete = true
 */
export const AVAILABILITY_QUERY = gql`
  query Availability($id: String!) {
    availability(id: $id) {
      id
      date
      optionList {
        isComplete
        nodes {
          id
          label
          dataType
          availableOptions {
            label
            value
          }
          answerValue
          answerFormattedText
        }
      }
    }
  }
`;

/**
 * Set option answers for an availability
 */
export const AVAILABILITY_SET_OPTIONS_QUERY = gql`
  query AvailabilitySetOptions($id: String!, $input: AvailabilityInput!) {
    availability(id: $id, input: $input) {
      id
      optionList {
        isComplete
        nodes {
          id
          label
          dataType
          availableOptions {
            label
            value
          }
          answerValue
          answerFormattedText
        }
      }
    }
  }
`;

/**
 * Step 5: Discover and Set Pricing Categories
 * Only available after optionList.isComplete = true
 */
export const AVAILABILITY_PRICING_QUERY = gql`
  query AvailabilityPricing($id: String!) {
    availability(id: $id) {
      id
      maxParticipants
      minParticipants
      isValid
      totalPrice {
        grossFormattedText
        netFormattedText
        gross
        net
        currency
      }
      pricingCategoryList {
        nodes {
          id
          label
          minParticipants
          maxParticipants
          maxParticipantsDepends {
            pricingCategoryId
            multiplier
            explanation
          }
          units
          unitPrice {
            netFormattedText
            grossFormattedText
            gross
            net
            currency
          }
          totalPrice {
            grossFormattedText
            gross
            currency
          }
        }
      }
    }
  }
`;

/**
 * Set units for pricing categories
 */
export const AVAILABILITY_SET_PRICING_QUERY = gql`
  query AvailabilitySetPricing($id: String!, $input: AvailabilityInput!) {
    availability(id: $id, input: $input) {
      id
      isValid
      totalPrice {
        grossFormattedText
        gross
        currency
      }
      pricingCategoryList {
        nodes {
          id
          label
          units
          unitPrice {
            grossFormattedText
            gross
          }
          totalPrice {
            grossFormattedText
            gross
          }
        }
      }
    }
  }
`;

// ============================================================================
// BOOKING MUTATIONS (Holibob Look-to-Book Step 6-9)
// ============================================================================

/**
 * Step 6: Create a Booking (basket/cart)
 * Strongly recommend passing autoFillQuestions = true
 */
export const BOOKING_CREATE_MUTATION = gql`
  mutation BookingCreate($input: BookingCreateInput!) {
    bookingCreate(input: $input) {
      id
      code
      state
      isComplete
      paymentState
    }
  }
`;

/**
 * Step 7: Add Availability to Booking
 * Returns the updated booking so we can check if questions still need answering
 */
export const BOOKING_ADD_AVAILABILITY_MUTATION = gql`
  mutation BookingAddAvailability($input: BookingAddAvailabilityInputType!) {
    bookingAddAvailability(input: $input) {
      id
      code
      state
      canCommit
    }
  }
`;

/**
 * Step 8: Retrieve Booking Questions
 * Questions exist at three levels: Booking, Availability, Person
 */
export const BOOKING_QUESTIONS_QUERY = gql`
  query BookingQuestions($id: String!) {
    booking(id: $id) {
      id
      code
      leadPassengerName
      partnerExternalReference
      state
      isSandboxed
      paymentState
      canCommit
      totalPrice {
        grossFormattedText
        gross
        currency
      }
      questionList {
        nodes {
          id
          label
          autoCompleteValue
          type
          dataType
          dataFormat
          answerValue
          isRequired
        }
      }
      availabilityList {
        nodes {
          id
          date
          totalPrice {
            grossFormattedText
            gross
            currency
          }
          product {
            id
            name
          }
          questionList {
            nodes {
              id
              label
              type
              dataType
              dataFormat
              answerValue
              isRequired
            }
          }
          personList {
            nodes {
              id
              pricingCategoryLabel
              isQuestionsComplete
              questionList {
                nodes {
                  id
                  label
                  type
                  dataType
                  dataFormat
                  answerValue
                  isRequired
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Answer booking questions
 * Must iterate until canCommit = true
 *
 * BookingInput accepts:
 * - leadPassengerName: String (optional)
 * - reference: String (optional partner reference)
 * - answerList: Array of { questionId: String!, value: String! }
 */
export const BOOKING_ANSWER_QUESTIONS_QUERY = gql`
  query BookingAnswerQuestions($id: String!, $input: BookingInput!) {
    booking(id: $id, input: $input) {
      id
      canCommit
      leadPassengerName
      questionList {
        nodes {
          id
          label
          answerValue
          isRequired
        }
      }
      availabilityList {
        nodes {
          id
          questionList {
            nodes {
              id
              label
              answerValue
              isRequired
            }
          }
          personList {
            nodes {
              id
              pricingCategoryLabel
              isQuestionsComplete
              questionList {
                nodes {
                  id
                  label
                  answerValue
                  isRequired
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Step 9a: Get Stripe Payment Intent
 * Fetches the Stripe payment intent for processing payment before commit
 * Required when partner channel has paymentType: REQUIRED
 */
export const STRIPE_PAYMENT_INTENT_QUERY = gql`
  query StripePaymentIntent($bookingSelector: BookingSelector!) {
    stripePaymentIntent(bookingSelector: $bookingSelector) {
      id
      amount
      clientSecret
      apiKey
      createdAt
    }
  }
`;

/**
 * Step 9b: Commit Booking
 * Finalizes the booking and starts supplier confirmation process
 * Should only be called after payment is successful (if paymentType: REQUIRED)
 */
export const BOOKING_COMMIT_MUTATION = gql`
  mutation BookingCommit($bookingSelector: BookingSelector!) {
    bookingCommit(bookingSelector: $bookingSelector) {
      code
      state
      voucherUrl
    }
  }
`;

/**
 * Poll booking state until CONFIRMED
 */
export const BOOKING_STATE_QUERY = gql`
  query BookingState($id: String!) {
    booking(id: $id) {
      id
      code
      state
      voucherUrl
      totalPrice {
        grossFormattedText
        gross
        currency
      }
    }
  }
`;

/**
 * Get full booking details including voucher
 */
export const BOOKING_FULL_QUERY = gql`
  query BookingFull($id: String!) {
    booking(id: $id) {
      id
      code
      state
      leadPassengerName
      partnerExternalReference
      isSandboxed
      paymentState
      voucherUrl
      totalPrice {
        grossFormattedText
        netFormattedText
        gross
        net
        currency
      }
      availabilityList {
        nodes {
          id
          date
          startTime: startAt
          product {
            id
            name
            description
            imageList {
              id
              url
            }
          }
          totalPrice {
            grossFormattedText
            gross
            currency
          }
          personList {
            nodes {
              id
              pricingCategoryLabel
            }
          }
        }
      }
      questionList {
        nodes {
          id
          label
          answerValue
        }
      }
      createdAt
      confirmedAt
    }
  }
`;

/**
 * List bookings for a consumer trip or consumer
 */
export const BOOKING_LIST_QUERY = gql`
  query BookingList($filter: BookingListFilterInput, $first: Int, $after: String) {
    bookingList(filter: $filter, first: $first, after: $after) {
      recordCount
      nodes {
        code
        id
        state
        totalPrice {
          grossFormattedText
          currency
        }
        consumerTrip {
          id
          partnerExternalReference
          consumer {
            id
            partnerExternalReference
            familyName
          }
        }
      }
    }
  }
`;

/**
 * Cancel a booking
 */
export const BOOKING_CANCEL_MUTATION = gql`
  mutation BookingCancel($bookingSelector: BookingSelector!, $reason: String) {
    bookingCancel(bookingSelector: $bookingSelector, reason: $reason) {
      id
      code
      state
    }
  }
`;

// ============================================================================
// PROVIDER (OPERATOR) QUERIES - For Microsite System
// ============================================================================

/**
 * Get list of all providers (operators/suppliers)
 *
 * NOTE: This endpoint requires elevated permissions that most partners don't have.
 * As an alternative, discover providers via productList which includes provider info.
 *
 * Provider type only has id and name fields (no description, productCount, etc.)
 */
export const PROVIDER_LIST_QUERY = gql`
  query ProviderList {
    providerList {
      recordCount
      nodes {
        id
        name
      }
    }
  }
`;

/**
 * Get all providers using providerTree from productList
 *
 * This is the RECOMMENDED approach for discovering all providers.
 * Returns all providers with their product counts in a single query.
 *
 * providerTree returns:
 * - id: Provider ID
 * - label: Provider name
 * - count: Number of products for this provider
 */
export const PROVIDER_TREE_QUERY = gql`
  query GetAllProvidersWithProductCounts {
    productList {
      recordCount
      providerTree {
        recordCount
        nodes {
          id
          label
          count
        }
      }
    }
  }
`;

/**
 * Get a single provider by ID
 *
 * NOTE: This endpoint may require elevated permissions.
 * Provider type only has id and name fields.
 */
export const PROVIDER_DETAIL_QUERY = gql`
  query ProviderDetail($id: String!) {
    provider(id: $id) {
      id
      name
    }
  }
`;

// ============================================================================
// PRODUCT LIST QUERIES - For Microsite System
// ============================================================================

/**
 * Get products filtered by provider ID with pagination and optional filters
 * This is the correct endpoint for microsites - NOT Product Discovery
 * Product Discovery is for marketplace search (location/date/activity based)
 * Product List is for getting all products for a specific provider
 *
 * NOTE: Holibob API uses String type for providerId, not ID type
 * NOTE: place field in productList uses ProductPlace schema (cityId only, no name)
 *
 * Pagination parameters (per Holibob docs):
 * - pageSize: Number of records per page (max 5000, default 20)
 * - page: Page number to retrieve (starts at 1)
 *
 * Filter parameters (per Holibob docs):
 * - categoryIds: Filter by category IDs
 * - search: Text search across name, description, keywords
 * - placeName: Filter by city/country name
 *
 * Response includes pagination info:
 * - recordCount, unfilteredRecordCount, pages, nextPage, previousPage
 */
export const PRODUCT_LIST_BY_PROVIDER_QUERY = gql`
  query ProductListByProvider(
    $providerId: String!
    $pageSize: Int
    $page: Int
    $categoryIds: [String!]
    $search: String
    $placeName: String
  ) {
    productList(
      filter: {
        providerId: $providerId
        categoryIds: $categoryIds
        search: $search
        placeName: $placeName
      }
      pageSize: $pageSize
      page: $page
    ) {
      recordCount
      unfilteredRecordCount
      pages
      nextPage
      previousPage
      nodes {
        id
        name
        description
        guidePrice
        guidePriceFormattedText
        guidePriceCurrency
        imageList {
          id
          url
        }
        maxDuration
        reviewRating
        reviewCount
        provider {
          id
          name
        }
        categoryList {
          nodes {
            id
            name
          }
        }
        place {
          cityId
        }
      }
    }
  }
`;

/**
 * Get all products - for bulk sync operations
 * NOTE: productList does not support pagination (no first/after args)
 * NOTE: place field in productList uses different schema than productDetail
 */
export const PRODUCT_LIST_ALL_QUERY = gql`
  query ProductListAll {
    productList {
      recordCount
      nodes {
        id
        name
        description
        shortDescription
        guidePrice
        guidePriceFormattedText
        guidePriceCurrency
        imageList {
          id
          url
        }
        maxDuration
        reviewRating
        reviewCount
        provider {
          id
          name
        }
        categoryList {
          nodes {
            id
            name
          }
        }
        place {
          cityId
          name
        }
      }
    }
  }
`;

// ============================================================================
// CATEGORY & PLACE QUERIES
// ============================================================================

export const CATEGORIES_QUERY = gql`
  query Categories($placeId: ID) {
    categoryList(placeId: $placeId) {
      nodes {
        id
        name
        slug
        description
        imageUrl
        productCount
      }
    }
  }
`;

export const PLACES_QUERY = gql`
  query Places($parentId: ID, $type: PlaceType) {
    placeList(parentId: $parentId, type: $type) {
      nodes {
        id
        name
        slug
        type
        lat
        lng
        imageUrl
        productCount
      }
    }
  }
`;

// ============================================================================
// LEGACY QUERY EXPORTS (for backwards compatibility)
// ============================================================================

export const PRODUCT_DISCOVERY_QUERY = PRODUCT_LIST_QUERY;
export const CREATE_BOOKING_MUTATION = BOOKING_CREATE_MUTATION;
export const GET_BOOKING_QUERY = BOOKING_FULL_QUERY;
export const COMMIT_BOOKING_MUTATION = BOOKING_COMMIT_MUTATION;
export const CANCEL_BOOKING_MUTATION = BOOKING_CANCEL_MUTATION;
export const ADD_BOOKING_ITEM_MUTATION = BOOKING_ADD_AVAILABILITY_MUTATION;
export const AVAILABILITY_CALENDAR_QUERY = AVAILABILITY_LIST_QUERY;
export const UPDATE_BOOKING_GUESTS_MUTATION = BOOKING_ANSWER_QUESTIONS_QUERY;
