import { describe, expect, it } from 'vitest';
import { LOCATION_MAX_CLIENTS, LOCATION_RATE_LIMIT, LOCATION_RATE_WINDOW_MS, LocationRateLimiter } from '../../src/geoapify/location-rate-limit.guard.js';

describe('Bounded public location rate limiter', () => {
  it('counts each client separately and reopens only after its fixed window', () => {
    const limiter = new LocationRateLimiter();
    for (let i = 0; i < LOCATION_RATE_LIMIT; i++) expect(limiter.consume('client', 0)).toBe(0);
    expect(limiter.consume('client', 1)).toBe(60);
    expect(limiter.consume('another-client', 1)).toBe(0);
    expect(limiter.consume('client', LOCATION_RATE_WINDOW_MS - 1)).toBe(1);
    expect(limiter.consume('client', LOCATION_RATE_WINDOW_MS)).toBe(0);
  });
  it('caps stored identities without evicting active rate limits', () => {
    const limiter = new LocationRateLimiter();
    for (let i = 0; i < LOCATION_MAX_CLIENTS; i++) expect(limiter.consume('client-' + i, 0)).toBe(0);
    expect(limiter.consume('overflow', 1)).toBe(60);
    for (let i = 1; i < LOCATION_RATE_LIMIT; i++) expect(limiter.consume('client-0', 1)).toBe(0);
    expect(limiter.consume('client-0', 1)).toBe(60);
    expect(limiter.consume('overflow', LOCATION_RATE_WINDOW_MS)).toBe(0);
  });
});
