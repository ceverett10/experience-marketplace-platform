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
};

export type TickittoAvailabilitySlot = {
  id: string;
  date: string;
};
