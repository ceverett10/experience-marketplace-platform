import { gql } from 'graphql-request';

// ============================================================================
// PRODUCT DISCOVERY QUERIES (Holibob Look-to-Book Step 1 & 2)
// ============================================================================

/**
 * Step 1: Discover Products
 * Use productList query with filters and pagination
 */
export const PRODUCT_LIST_QUERY = gql`
  query ProductList(
    $filter: ProductFilterInput
    $first: Int
    $after: String
  ) {
    productList(
      filter: $filter
      first: $first
      after: $after
    ) {
      nodes {
        id
        name
        guidePriceFormattedText
        guidePrice
        guidePriceCurrency
        shortDescription
        imageList {
          nodes {
            id
            url
          }
        }
        categoryList {
          nodes {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

/**
 * Step 2: Display Product Details
 * Retrieve detailed product information
 */
export const PRODUCT_DETAIL_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id
      name
      description
      shortDescription
      guidePrice
      guidePriceFormattedText
      guidePriceCurrency
      imageList {
        nodes {
          id
          url
          altText
        }
      }
      categoryList {
        nodes {
          id
          name
          slug
        }
      }
      highlights
      inclusions
      exclusions
      importantInfo
      duration
      durationText
      location {
        name
        address
        lat
        lng
      }
      cancellationPolicy {
        type
        description
        cutoffHours
      }
      meetingPoint {
        name
        address
        instructions
        lat
        lng
      }
    }
  }
`;

// ============================================================================
// AVAILABILITY QUERIES (Holibob Look-to-Book Step 3 & 4)
// ============================================================================

/**
 * Step 3: Request Availability List (Recursive Method - RECOMMENDED)
 * Initial call returns options that must be answered (START_DATE, END_DATE, etc.)
 * Subsequent calls with sessionId and optionList answers
 */
export const AVAILABILITY_LIST_QUERY = gql`
  query AvailabilityList(
    $productId: ID!
    $sessionId: String
    $optionList: [AvailabilityOptionInput!]
  ) {
    availabilityList(
      productId: $productId
      sessionId: $sessionId
      optionList: $optionList
    ) {
      sessionId
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
          dataFormat
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
  query Availability($id: ID!) {
    availability(id: $id) {
      id
      date
      optionList {
        isComplete
        nodes {
          id
          label
          dataType
          dataFormat
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
  query AvailabilitySetOptions(
    $id: ID!
    $input: AvailabilityInput!
  ) {
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
  query AvailabilityPricing($id: ID!) {
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
  query AvailabilitySetPricing(
    $id: ID!
    $input: AvailabilityInput!
  ) {
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
 * Returns isComplete = false initially, requiring question answers
 */
export const BOOKING_ADD_AVAILABILITY_MUTATION = gql`
  mutation BookingAddAvailability($input: BookingAddAvailabilityInput!) {
    bookingAddAvailability(input: $input) {
      isComplete
    }
  }
`;

/**
 * Step 8: Retrieve Booking Questions
 * Questions exist at three levels: Booking, Availability, Person
 */
export const BOOKING_QUESTIONS_QUERY = gql`
  query BookingQuestions($id: ID!) {
    booking(id: $id) {
      id
      code
      leadPassengerName
      partnerExternalReference
      state
      isSandboxed
      paymentState
      canCommit
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
 */
export const BOOKING_ANSWER_QUESTIONS_QUERY = gql`
  query BookingAnswerQuestions($id: ID!, $input: BookingInput!) {
    booking(id: $id, input: $input) {
      canCommit
      questionList {
        nodes {
          id
          answerValue
        }
      }
    }
  }
`;

/**
 * Step 9: Commit Booking
 * Finalizes the booking and starts supplier confirmation process
 */
export const BOOKING_COMMIT_MUTATION = gql`
  mutation BookingCommit($bookingSelector: BookingSelectorInput!) {
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
  query BookingState($id: ID!) {
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
  query BookingFull($id: ID!) {
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
          startTime
          product {
            id
            name
            shortDescription
            imageList {
              nodes {
                url
              }
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
  query BookingList(
    $filter: BookingListFilterInput
    $first: Int
    $after: String
  ) {
    bookingList(
      filter: $filter
      first: $first
      after: $after
    ) {
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
  mutation BookingCancel($bookingSelector: BookingSelectorInput!, $reason: String) {
    bookingCancel(bookingSelector: $bookingSelector, reason: $reason) {
      id
      code
      state
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
