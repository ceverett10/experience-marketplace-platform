import { gql } from 'graphql-request';

// ============================================================================
// PRODUCT DISCOVERY QUERIES
// ============================================================================

export const PRODUCT_DISCOVERY_QUERY = gql`
  query ProductDiscovery(
    $filter: ProductDiscoveryInput!
    $first: Int
    $after: String
  ) {
    productDiscovery(filter: $filter, first: $first, after: $after) {
      products {
        id
        name
        description
        shortDescription
        priceFrom
        priceTo
        currency
        imageUrl
        images {
          url
          alt
          isPrimary
        }
        duration
        durationText
        location {
          name
          address
          lat
          lng
        }
        categories {
          id
          name
        }
        tags
        rating
        reviewCount
        hasInstantConfirmation
        isBestSeller
        supplierId
        supplierName
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const PRODUCT_DETAIL_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id
      name
      description
      shortDescription
      priceFrom
      priceTo
      currency
      imageUrl
      images {
        url
        alt
        isPrimary
      }
      duration
      durationText
      location {
        name
        address
        lat
        lng
      }
      categories {
        id
        name
      }
      tags
      rating
      reviewCount
      hasInstantConfirmation
      isBestSeller
      supplierId
      supplierName

      # Extended details
      highlights
      inclusions
      exclusions
      importantInfo
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

export const PRODUCT_LIST_QUERY = gql`
  query ProductList(
    $categoryId: ID
    $placeId: ID
    $first: Int
    $after: String
    $sortBy: ProductSortBy
  ) {
    products(
      categoryId: $categoryId
      placeId: $placeId
      first: $first
      after: $after
      sortBy: $sortBy
    ) {
      edges {
        node {
          id
          name
          shortDescription
          priceFrom
          currency
          imageUrl
          rating
          reviewCount
          hasInstantConfirmation
          isBestSeller
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

// ============================================================================
// AVAILABILITY QUERIES
// ============================================================================

export const AVAILABILITY_QUERY = gql`
  query Availability(
    $productId: ID!
    $dateFrom: Date!
    $dateTo: Date!
    $adults: Int!
    $children: Int
  ) {
    availability(
      productId: $productId
      dateFrom: $dateFrom
      dateTo: $dateTo
      adults: $adults
      children: $children
    ) {
      productId
      options {
        id
        name
        description
        price
        originalPrice
        currency
        date
        startTime
        endTime
        maxCapacity
        remainingCapacity
        guestTypes {
          id
          name
          minAge
          maxAge
          price
        }
        extras {
          id
          name
          price
          isRequired
        }
        cutoffMinutes
        instantConfirmation
      }
    }
  }
`;

export const AVAILABILITY_CALENDAR_QUERY = gql`
  query AvailabilityCalendar(
    $productId: ID!
    $month: Int!
    $year: Int!
  ) {
    availabilityCalendar(
      productId: $productId
      month: $month
      year: $year
    ) {
      dates {
        date
        available
        priceFrom
        spotsRemaining
      }
    }
  }
`;

// ============================================================================
// BOOKING MUTATIONS
// ============================================================================

export const CREATE_BOOKING_MUTATION = gql`
  mutation CreateBooking($input: CreateBookingInput!) {
    bookingCreate(input: $input) {
      id
      status
      items {
        availabilityId
        productId
        productName
        date
        startTime
        guests {
          guestTypeId
          firstName
          lastName
        }
        unitPrice
        totalPrice
        currency
      }
      subtotal
      fees
      taxes
      total
      currency
      customerEmail
      createdAt
      updatedAt
    }
  }
`;

export const ADD_BOOKING_ITEM_MUTATION = gql`
  mutation AddBookingItem($bookingId: ID!, $item: BookingItemInput!) {
    bookingAddItem(bookingId: $bookingId, item: $item) {
      id
      status
      items {
        availabilityId
        productId
        productName
        totalPrice
      }
      total
      currency
    }
  }
`;

export const UPDATE_BOOKING_GUESTS_MUTATION = gql`
  mutation UpdateBookingGuests(
    $bookingId: ID!
    $itemId: ID!
    $guests: [GuestInput!]!
  ) {
    bookingUpdateGuests(
      bookingId: $bookingId
      itemId: $itemId
      guests: $guests
    ) {
      id
      items {
        availabilityId
        guests {
          guestTypeId
          firstName
          lastName
          email
        }
      }
    }
  }
`;

export const COMMIT_BOOKING_MUTATION = gql`
  mutation CommitBooking($id: ID!) {
    bookingCommit(id: $id) {
      id
      status
      total
      currency
      paymentIntentId
      confirmedAt
    }
  }
`;

export const GET_BOOKING_QUERY = gql`
  query GetBooking($id: ID!) {
    booking(id: $id) {
      id
      status
      items {
        availabilityId
        productId
        productName
        date
        startTime
        guests {
          guestTypeId
          firstName
          lastName
          email
        }
        extras {
          extraId
          quantity
        }
        unitPrice
        totalPrice
        currency
      }
      subtotal
      fees
      taxes
      total
      currency
      customerEmail
      customerPhone
      paymentStatus
      paymentIntentId
      createdAt
      updatedAt
      confirmedAt
    }
  }
`;

export const CANCEL_BOOKING_MUTATION = gql`
  mutation CancelBooking($id: ID!, $reason: String) {
    bookingCancel(id: $id, reason: $reason) {
      id
      status
      updatedAt
    }
  }
`;

// ============================================================================
// CATEGORY & PLACE QUERIES
// ============================================================================

export const CATEGORIES_QUERY = gql`
  query Categories($placeId: ID) {
    categories(placeId: $placeId) {
      id
      name
      slug
      description
      imageUrl
      productCount
      children {
        id
        name
        slug
      }
    }
  }
`;

export const PLACES_QUERY = gql`
  query Places($parentId: ID, $type: PlaceType) {
    places(parentId: $parentId, type: $type) {
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
`;
