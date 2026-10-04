import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FleetService } from '../../src/fleet/fleet.service.js';

describe('FleetService', () => {
  const query = { start: '2026-10-08T08:00:00.000Z', end: '2026-10-08T10:00:00.000Z', vehicleTypeId: '00000000-0000-4000-8000-000000000001', passengers: 2 };

  it('returns a normalized eligible vehicle-driver pair', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'vehicle-id', assignedDriverId: 'driver-id', vehicleTypeId: query.vehicleTypeId, passengerCapacity: 4 }]);
    const service = new FleetService({ vehicle: { findMany } } as never);
    await expect(service.availability(query)).resolves.toEqual({ eligible: [{ vehicleId: 'vehicle-id', driverId: 'driver-id', vehicleTypeId: query.vehicleTypeId, passengerCapacity: 4 }], exclusionReason: null });
  });

  it('returns a stable exclusion reason when no pair is eligible', async () => {
    const service = new FleetService({ vehicle: { findMany: vi.fn().mockResolvedValue([]) } } as never);
    await expect(service.availability(query)).resolves.toEqual({ eligible: [], exclusionReason: 'NO_ELIGIBLE_VEHICLE_DRIVER_PAIR' });
  });

  it('rejects an invalid availability interval before querying persistence', async () => {
    const findMany = vi.fn();
    const service = new FleetService({ vehicle: { findMany } } as never);
    await expect(service.availability({ ...query, end: query.start })).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
