import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LocationsService } from '../../src/locations/locations.service.js';
import { RoutingService } from '../../src/routing/routing.service.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { BookingType } from '../../src/generated/prisma/enums.js';

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

  it('does not resolve or route an oversized direct service request', async () => {
    const locations = { resolve: vi.fn() };
    const geoapify = { route: vi.fn() };
    const service = new RoutingService(locations as never, geoapify as never);
    await expect(service.preview({ placeIds: Array.from({ length: 11 }, () => 'place') })).rejects.toBeInstanceOf(BadRequestException);
    expect(locations.resolve).not.toHaveBeenCalled();
    expect(geoapify.route).not.toHaveBeenCalled();
  });

  it('does not call routing after a place-resolution failure', async () => {
    const locations = { resolve: vi.fn().mockRejectedValue(new Error('Synthetic resolution failure')) };
    const geoapify = { route: vi.fn() };
    const service = new RoutingService(locations as never, geoapify as never);
    await expect(service.preview({ placeIds: ['pickup', 'dropoff'] })).rejects.toThrow('Synthetic resolution failure');
    expect(geoapify.route).not.toHaveBeenCalled();
  });

  it('does not price or persist a Custom Trip quote after route-provider failure', async () => {
    const prisma = { vehicleType: { findUnique: vi.fn().mockResolvedValue({ id: 'van', isActive: true }) }, bookingQuote: { create: vi.fn() } };
    const pricing = { quote: vi.fn() };
    const routing = { preview: vi.fn().mockRejectedValue(new Error('Synthetic route failure')) };
    const service = new BookingsService(prisma as never, pricing as never, routing as never);
    await expect(service.issueQuote('customer', {
      bookingType: BookingType.CUSTOM_TRIP, vehicleTypeId: 'van', passengerCount: 1,
      startDatetime: '2099-01-01T08:00:00Z', endDatetime: '2099-01-01T10:00:00Z', routePlaceIds: ['pickup', 'dropoff'],
    })).rejects.toThrow('Synthetic route failure');
    expect(pricing.quote).not.toHaveBeenCalled();
    expect(prisma.bookingQuote.create).not.toHaveBeenCalled();
  });
});
