import { type INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationsModule } from '../../src/locations/locations.module.js';
import { RoutingModule } from '../../src/routing/routing.module.js';
import { LOCATION_RATE_LIMIT } from '../../src/geoapify/location-rate-limit.guard.js';

describe('Location/routing HTTP contracts with a stub provider', () => {
  let app: INestApplication;
  const fetcher = vi.fn();
  const place = (id: string) => ({ place_id: id, formatted: 'Synthetic landmark', lat: id === 'pickup' ? 10.3 : 10.31, lon: 123.9 });
  beforeEach(async () => {
    vi.stubEnv('GEOAPIFY_ENABLED', 'true'); vi.stubEnv('GEOAPIFY_API_KEY', 'synthetic-provider-key'); vi.stubEnv('GEOAPIFY_TIMEOUT_MS', '8000');
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    fetcher.mockReset().mockImplementation((input: string) => {
      const url = new URL(input);
      if (url.pathname === '/v1/geocode/autocomplete') return Promise.resolve(Response.json({ results: [place('pickup')] }));
      if (url.pathname === '/v2/place-details') return Promise.resolve(Response.json({ features: [{ properties: { ...place(url.searchParams.get('id')!), feature_type: 'details' } }] }));
      if (url.pathname === '/v1/routing') return Promise.resolve(Response.json({ features: [{ properties: { distance: 12345, time: 3661 }, geometry: { type: 'MultiLineString', coordinates: [[[123.9, 10.3], [123.9, 10.31]]] } }] }));
      throw new Error('Unexpected stub endpoint');
    });
    vi.stubGlobal('fetch', fetcher);
    const module = await Test.createTestingModule({ imports: [LocationsModule, RoutingModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('returns application-owned location data and no provider-only fields', async () => {
    const response = await request(app.getHttpServer()).get('/locations/autocomplete').query({ text: '  Synthetic  ', biasLat: '10.3', biasLon: '123.9' }).expect(200);
    expect(response.body).toEqual([{ placeId: 'pickup', formattedAddress: 'Synthetic landmark', latitude: 10.3, longitude: 123.9 }]);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get('text')).toBe('Synthetic');
  });
  it.each([{ text: '  ' }, { text: 'ab' }, { text: 'Synthetic', biasLat: '10.3' }, { text: 'Synthetic', biasLon: '123.9' }, { text: 'Synthetic', biasLat: '', biasLon: '' }, { text: 'Synthetic', biasLat: '91', biasLon: '123' }])('rejects invalid search/bias before provider work: %j', async (query) => {
    await request(app.getHttpServer()).get('/locations/autocomplete').query(query).expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds IDs and route size without resolving a bad route', async () => {
    await request(app.getHttpServer()).get('/locations/' + 'x'.repeat(501)).expect(400);
    await request(app.getHttpServer()).post('/routes/preview').send({ placeIds: Array.from({ length: 11 }, () => 'pickup') }).expect(400);
    await request(app.getHttpServer()).post('/routes/preview').send({ placeIds: ['pickup', ' '], totalDistanceKm: '1' }).expect(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves ordered resolved stops and converts server metrics exactly once', async () => {
    const response = await request(app.getHttpServer()).post('/routes/preview').send({ placeIds: ['pickup', 'dropoff'] }).expect(201);
    expect(response.body.stops.map((stop: { placeId: string }) => stop.placeId)).toEqual(['pickup', 'dropoff']);
    expect(response.body).toMatchObject({ totalDistanceKm: '12.35', estimatedDurationMinutes: 62, provider: 'geoapify' });
  });
  it('shares the public rate budget across autocomplete, resolution and route preview', async () => {
    for (let i = 0; i < LOCATION_RATE_LIMIT - 1; i++) await request(app.getHttpServer()).get('/locations/autocomplete').query({ text: 'Synthetic' }).expect(200);
    await request(app.getHttpServer()).get('/locations/pickup').expect(200);
    const limited = await request(app.getHttpServer()).post('/routes/preview').send({ placeIds: ['pickup', 'dropoff'] }).expect(429);
    expect(limited.body.code).toBe('LOCATION_RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(LOCATION_RATE_LIMIT);
  });
  it.each([[429, 'GEOAPIFY_RATE_LIMITED', 503], [503, 'GEOAPIFY_UNAVAILABLE', 503], [401, 'GEOAPIFY_REJECTED', 502]] as const)('maps upstream %s to a safe application error', async (status, code, expectedStatus) => {
    fetcher.mockResolvedValue(new Response('private provider body', { status }));
    const response = await request(app.getHttpServer()).get('/locations/autocomplete').query({ text: 'Synthetic' }).expect(expectedStatus);
    expect(response.body.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toMatch(/private provider|synthetic-provider-key|apiKey/);
  });
  it('fails route calculation when one resolved stop is malformed', async () => {
    fetcher.mockResolvedValue(Response.json({ features: [{ properties: { place_id: 'invalid', formatted: 'Synthetic', lat: 999, lon: 123 } }] }));
    const response = await request(app.getHttpServer()).post('/routes/preview').send({ placeIds: ['pickup', 'dropoff'] }).expect(502);
    expect(response.body.code).toBe('GEOAPIFY_INVALID_RESPONSE');
    expect(fetcher.mock.calls.some(([url]) => new URL(url).pathname === '/v1/routing')).toBe(false);
  });
});
