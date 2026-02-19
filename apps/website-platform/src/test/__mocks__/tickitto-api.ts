// Mock for @experience-marketplace/tickitto-api
export function createTickittoClient() {
  return {
    getEvents: async () => [],
    getEvent: async () => null,
    getAvailability: async () => ({ slots: [] }),
  };
}

export type TickittoEvent = {
  id: string;
  name: string;
  description: string;
  venue: { name: string; city: string };
  startDate: string;
  endDate: string;
  imageUrl: string;
  minPrice: number;
  maxPrice: number;
  currency: string;
};

export type TickittoAvailabilitySlot = {
  id: string;
  date: string;
  time: string;
  price: number;
  currency: string;
  available: boolean;
};
