import { describe, expect, it, vi } from 'vitest';
import { LocationsService } from '../../src/locations/locations.service.js';
import { RoutingService } from '../../src/routing/routing.service.js';

describe('location and routing services', () => {
  it('passes optional autocomplete bias through the normalized location boundary', async () => {
    const geoapify = { autocomplete: vi.fn().mockResolvedValue([{ placeId: 'place-1' }]) };
    const service = new LocationsService(geoapify as never);

    await expect(service.autocomplete({ text: 'Cebu', biasLat: 10.3, biasLon: 123.9 })).resolves.toEqual([{ placeId: 'place-1' }]);
    expect(geoapify.autocomplete).toHaveBeenCalledWith('Cebu', 10.3, 123.9);
  });

  it('preserves ordered resolved stops while returning normalized route metrics', async () => {
    const locations = {
      resolve: vi.fn()
        .mockResolvedValueOnce({ placeId: 'pickup', latitude: 10.1, longitude: 123.1 })
        .mockResolvedValueOnce({ placeId: 'dropoff', latitude: 10.2, longitude: 123.2 }),
    };
    const geoapify = {
      route: vi.fn().mockResolvedValue({
        distanceMeters: 12345,
        durationSeconds: 3661,
        geometry: { type: 'MultiLineString', coordinates: [] },
      }),
    };
    const service = new RoutingService(locations as never, geoapify as never);

    await expect(service.preview({ placeIds: ['pickup', 'dropoff'] })).resolves.toEqual({
      stops: [
        { placeId: 'pickup', latitude: 10.1, longitude: 123.1 },
        { placeId: 'dropoff', latitude: 10.2, longitude: 123.2 },
      ],
      totalDistanceKm: '12.35',
      estimatedDurationMinutes: 62,
      geometry: { type: 'MultiLineString', coordinates: [] },
      provider: 'geoapify',
    });
    expect(geoapify.route).toHaveBeenCalledWith([
      { placeId: 'pickup', latitude: 10.1, longitude: 123.1 },
      { placeId: 'dropoff', latitude: 10.2, longitude: 123.2 },
    ]);
  });
});
