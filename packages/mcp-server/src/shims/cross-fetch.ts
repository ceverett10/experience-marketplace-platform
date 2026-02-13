// Shim for cross-fetch — Node 20+ has native fetch, no need for node-fetch polyfill
export default globalThis.fetch;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;
