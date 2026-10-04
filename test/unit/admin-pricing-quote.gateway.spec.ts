import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BookingType, StopType } from '../../src/generated/prisma/enums.js';
import { AdminPricingQuoteGateway } from '../../src/pricing/pricing-quote.gateway.js';

describe('AdminPricingQuoteGateway', () => {
  const input = {
    bookingType: BookingType.CUSTOM_TRIP,
    vehicleTypeId: 'vehicle-type-id',
    startDatetime: new Date('2026-10-08T08:00:00Z'),
    endDatetime: new Date('2026-10-08T10:00:00Z'),
    passengerCount: 2,
    stops: [{ stopType: StopType.PICKUP, latitude: 14.6, longitude: 120.9 }],
  };

  it('uses the one active configuration as the fixed custom-trip price', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'config-id', baseRate: '1250.00' }]);
    const gateway = new AdminPricingQuoteGateway({ pricingConfiguration: { findMany } } as never);
    await expect(gateway.quote(input)).resolves.toMatchObject({ pricingConfigurationId: 'config-id', finalQuotedPrice: '1250.00', totalDistanceKm: '0.00', modelVersion: 'admin-fixed-v1' });
  });

  it('adds the configured vehicle adjustment to a package base price', async () => {
    const gateway = new AdminPricingQuoteGateway({ pricingConfiguration: { findMany: vi.fn().mockResolvedValue([{ id: 'config-id', baseRate: '300.00' }]) } } as never);
    await expect(gateway.quote({ ...input, bookingType: BookingType.TOUR_PACKAGE, tourPackageBasePrice: '2200.00', tourPackageDurationMinutes: 180 })).resolves.toMatchObject({ finalQuotedPrice: '2500.00', estimatedDurationMinutes: 180 });
  });

  it('fails closed when no single configuration applies', async () => {
    const gateway = new AdminPricingQuoteGateway({ pricingConfiguration: { findMany: vi.fn().mockResolvedValue([]) } } as never);
    await expect(gateway.quote(input)).rejects.toBeInstanceOf(ConflictException);
  });
});
