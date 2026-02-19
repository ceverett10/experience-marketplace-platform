// Mock for @experience-marketplace/holibob-api
export function createHolibobClient() {
  return {
    getProduct: async () => null,
    getProducts: async () => ({ products: [], totalCount: 0 }),
    searchProducts: async () => ({ products: [], totalCount: 0 }),
    getAvailability: async () => ({ slots: [] }),
    createBooking: async () => ({ id: 'mock-booking' }),
    commitBooking: async () => ({ id: 'mock-booking', status: 'CONFIRMED' }),
    getBooking: async () => null,
    getBookingQuestions: async () => ({ questions: [] }),
    answerBookingQuestions: async () => ({ booking: null, canCommit: false }),
  };
}

export type HolibobClient = ReturnType<typeof createHolibobClient>;
