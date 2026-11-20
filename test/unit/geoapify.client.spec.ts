import { BadRequestException, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeoapifyClient } from '../../src/geoapify/geoapify.client.js';
import { GeoapifyError } from '../../src/geoapify/geoapify.error.js';

describe('Geoapify adapter configuration and provider contracts', () => {
  const secret = 'synthetic-provider-key';
  const place = { place_id: 'synthetic-place', formatted: 'Synthetic landmark', lat: 10.3, lon: 123.9, ignored: 'provider-only' };
  const geometry = { type: 'MultiLineString', coordinates: [[[123.9, 10.3], [123.91, 10.31]]] };
  const fetcher = vi.fn();
  beforeEach(() => {
    vi.stubEnv('GEOAPIFY_ENABLED', 'true'); vi.stubEnv('GEOAPIFY_API_KEY', secret); vi.stubEnv('GEOAPIFY_TIMEOUT_MS', '8000');
    vi.stubGlobal('fetch', fetcher); fetcher.mockReset();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('normalizes bounded autocomplete results and encodes provider parameters server-side', async () => {
    fetcher.mockResolvedValue(Response.json({ results: Array.from({ length: 12 }, () => place) }));
    const result = await new GeoapifyClient().autocomplete('  Synthetic landmark  ', 10.3, 123.9);
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual({ placeId: place.place_id, formattedAddress: place.formatted, latitude: 10.3, longitude: 123.9 });
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.origin).toBe('https://api.geoapify.com');
    expect(url.searchParams.get('apiKey')).toBe(secret);
    expect(url.searchParams.get('text')).toBe('Synthetic landmark');
    expect(url.searchParams.get('bias')).toBe('proximity:123.9,10.3');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  });
  it('accepts a genuine empty search and prefers the details feature', async () => {
    fetcher.mockResolvedValueOnce(Response.json({ results: [] })).mockResolvedValueOnce(Response.json({ features: [
      { properties: { feature_type: 'building' } }, { properties: { ...place, feature_type: 'details' } },
    ] }));
    const client = new GeoapifyClient();
    expect(await client.autocomplete('No result')).toEqual([]);
    expect(await client.placeDetails('synthetic-place')).toMatchObject({ placeId: place.place_id });
  });
  it('preserves waypoint order and returns only valid route metrics/geometry', async () => {
    fetcher.mockResolvedValue(Response.json({ features: [{ properties: { distance: 1234, time: 185 }, geometry }] }));
    const result = await new GeoapifyClient().route([{ latitude: 10.3, longitude: 123.9 }, { latitude: 10.31, longitude: 123.91 }]);
    expect(result).toEqual({ distanceMeters: 1234, durationSeconds: 185, geometry });
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get('waypoints')).toBe('10.3,123.9|10.31,123.91');
  });
  it.each([null, {}, { results: {} }, { results: [null] }, { results: [{ ...place, lat: 91 }] }])('fails closed on malformed autocomplete: %j', async (payload) => {
    fetcher.mockResolvedValue(Response.json(payload));
    await expect(new GeoapifyClient().autocomplete('Synthetic')).rejects.toMatchObject({ failure: 'INVALID_RESPONSE' });
  });
  it.each([
    { properties: { distance: -1, time: 10 }, geometry },
    { properties: { distance: 1, time: -1 }, geometry },
    { properties: { distance: 1, time: 10 }, geometry: { type: 'MultiLineString', coordinates: [] } },
    { properties: { distance: 1, time: 10 }, geometry: { type: 'LineString', coordinates: [[200, 10], [123, 10]] } },
  ])('rejects invalid route evidence: %j', async (feature) => {
    fetcher.mockResolvedValue(Response.json({ features: [feature] }));
    await expect(new GeoapifyClient().route([{ latitude: 10.3, longitude: 123.9 }, { latitude: 10.31, longitude: 123.91 }])).rejects.toBeInstanceOf(GeoapifyError);
  });
  it.each([[429, 'RATE_LIMITED', 503], [503, 'UNAVAILABLE', 503], [401, 'REJECTED', 502]] as const)('maps upstream %s without leaking its body', async (status, failure, expectedStatus) => {
    fetcher.mockResolvedValue(new Response('private ' + secret, { status }));
    const error = await new GeoapifyClient().autocomplete('Synthetic').then(() => { throw new Error('Expected provider failure'); }, error => error as GeoapifyError);
    expect(error).toBeInstanceOf(GeoapifyError); expect(error.failure).toBe(failure); expect(error.getStatus()).toBe(expectedStatus);
    expect(JSON.stringify(error.getResponse())).not.toContain(secret);
  });
  it('distinguishes timeout/network/JSON failures and emits safe metric events', async () => {
    fetcher.mockRejectedValueOnce(new DOMException('private ' + secret, 'TimeoutError'))
      .mockRejectedValueOnce(new Error('private ' + secret)).mockResolvedValueOnce(new Response('not JSON', { status: 200 }));
    const client = new GeoapifyClient();
    for (const failure of ['TIMEOUT', 'UNAVAILABLE', 'INVALID_RESPONSE']) {
      await expect(client.autocomplete('Private search text', 10.3, 123.9)).rejects.toMatchObject({ failure });
    }
    const entries = vi.mocked(Logger.prototype.log).mock.calls.map(([message]) => JSON.parse(message as string));
    expect(entries.map(entry => entry.outcome)).toEqual(['TIMEOUT', 'UNAVAILABLE', 'INVALID_RESPONSE']);
    expect(entries.every(entry => typeof entry.durationMs === 'number')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/synthetic-provider-key|Private search text|10\.3|123\.9|https:/);
  });
  it('rejects invalid inputs before a provider call', async () => {
    const client = new GeoapifyClient();
    await expect(client.autocomplete('  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(client.autocomplete('Synthetic', 10.3)).rejects.toBeInstanceOf(BadRequestException);
    await expect(client.placeDetails('bad id')).rejects.toBeInstanceOf(BadRequestException);
    await expect(client.route(Array.from({ length: 11 }, () => ({ latitude: 10, longitude: 123 })))).rejects.toBeInstanceOf(BadRequestException);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['yes', '', 'TRUE'])('fails startup on invalid enabled flag %j', (value) => {
    vi.stubEnv('GEOAPIFY_ENABLED', value); expect(() => new GeoapifyClient()).toThrow('GEOAPIFY_ENABLED');
  });
  it.each(['0', '999', '30001', 'Infinity', '8000ms'])('fails startup on invalid timeout %j', (value) => {
    vi.stubEnv('GEOAPIFY_TIMEOUT_MS', value); expect(() => new GeoapifyClient()).toThrow('GEOAPIFY_TIMEOUT_MS');
  });
  it('fails enabled startup without a key, while disabled calls are explicit and never fetch', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', ''); expect(() => new GeoapifyClient()).toThrow('GEOAPIFY_API_KEY');
    vi.stubEnv('GEOAPIFY_ENABLED', 'false');
    await expect(new GeoapifyClient().autocomplete('Synthetic')).rejects.toMatchObject({ failure: 'NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
