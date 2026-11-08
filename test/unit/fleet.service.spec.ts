import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AccountStatus,
  DriverStatus,
  EmploymentStatus,
  FuelType,
  UserRole,
  VehicleStatus,
} from '../../src/generated/prisma/enums.js';
import { FleetService } from '../../src/fleet/fleet.service.js';

describe('FleetService', () => {
  const makeService = (client: Record<string, unknown>) => new FleetService({
    bookingAssignment: { findFirst: vi.fn().mockResolvedValue(null) }, ...client,
  } as never);
  const availabilityQuery = {
    start: '2030-10-08T08:00:00.000Z',
    end: '2030-10-08T10:00:00.000Z',
    vehicleTypeId: '00000000-0000-4000-8000-000000000001',
    passengers: 2,
  };

  const activeUser = {
    role: UserRole.STAFF,
    accountStatus: AccountStatus.ACTIVE,
  };
  const activeStaff = {
    employmentStatus: EmploymentStatus.ACTIVE,
    user: activeUser,
  };

  it('returns a normalized eligible vehicle-driver pair', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'vehicle-id',
        assignedDriverId: 'driver-id',
        vehicleTypeId: availabilityQuery.vehicleTypeId,
        passengerCapacity: 4,
      },
    ]);
    const service = makeService({ vehicle: { findMany } } as never);

    await expect(service.availability(availabilityQuery)).resolves.toEqual({
      eligible: [
        {
          vehicleId: 'vehicle-id',
          driverId: 'driver-id',
          vehicleTypeId: availabilityQuery.vehicleTypeId,
          passengerCapacity: 4,
        },
      ],
      exclusionReason: null,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedDriver: {
            is: expect.objectContaining({
              licenseExpiry: { gte: new Date('2030-10-08T00:00:00.000Z') },
            }),
          },
        }),
      }),
    );
  });

  it('returns a stable exclusion reason when no pair is eligible', async () => {
    const service = makeService({
      vehicle: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(service.availability(availabilityQuery)).resolves.toEqual({
      eligible: [],
      exclusionReason: 'NO_ELIGIBLE_VEHICLE_DRIVER_PAIR',
    });
  });

  it('prevents readiness changes that bypass an active assignment', async () => {
    const update = vi.fn();
    const service = makeService({
      bookingAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'active-assignment' }) },
      vehicle: { update },
    });
    await expect(service.updateVehicleStatus('vehicle-id', VehicleStatus.UNAVAILABLE))
      .rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an invalid availability interval before querying persistence', async () => {
    const findMany = vi.fn();
    const service = makeService({ vehicle: { findMany } } as never);

    await expect(
      service.availability({ ...availabilityQuery, end: availabilityQuery.start }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('creates a vehicle as unavailable', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'vehicle-id' });
    const service = makeService({
      vehicleType: { findUnique: vi.fn().mockResolvedValue({ id: 'type-id' }) },
      vehicle: { create },
    } as never);

    await service.createVehicle({
      vehicleTypeId: 'type-id',
      plateNumber: ' abc 1234 ',
      fuelType: FuelType.DIESEL,
      fuelEfficiency: 10.5,
      vehicleModel: 'Toyota Hiace',
      passengerCapacity: 12,
      yearModel: 2025,
      color: 'White',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plateNumber: 'ABC 1234',
          vehicleStatus: VehicleStatus.UNAVAILABLE,
        }),
      }),
    );
  });

  it('creates a driver only from an eligible Staff record', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'driver-id' });
    const service = makeService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'staff-id',
          ...activeStaff,
          driver: null,
        }),
      },
      driver: { create },
    } as never);

    await service.createDriver({
      staffId: 'staff-id',
      licenseNumber: ' n01-23-456789 ',
      licenseExpiry: '2035-12-31',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverStatus: DriverStatus.UNAVAILABLE,
          licenseNumber: 'N01-23-456789',
          licenseExpiry: new Date('2035-12-31T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('rejects onboarding when the profile is not Staff', async () => {
    const service = makeService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'staff-id',
          employmentStatus: EmploymentStatus.ACTIVE,
          user: { ...activeUser, role: UserRole.ADMIN },
          driver: null,
        }),
      },
    } as never);

    await expect(
      service.createDriver({
        staffId: 'staff-id',
        licenseNumber: 'N01-23-456789',
        licenseExpiry: '2035-12-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate driver licence to a conflict response', async () => {
    const service = makeService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'staff-id',
          ...activeStaff,
          driver: null,
        }),
      },
      driver: {
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    } as never);

    await expect(
      service.createDriver({
        staffId: 'staff-id',
        licenseNumber: 'N01-23-456789',
        licenseExpiry: '2035-12-31',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects silently replacing a vehicle designated driver', async () => {
    const service = makeService({
      vehicle: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'vehicle-id',
          assignedDriverId: 'existing-driver-id',
          isDeleted: false,
          assignedDriver: { id: 'existing-driver-id' },
        }),
      },
      driver: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'new-driver-id',
          licenseExpiry: new Date('2035-12-31'),
          staff: activeStaff,
          vehicle: null,
        }),
      },
    } as never);

    await expect(
      service.designateDriver('vehicle-id', 'new-driver-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects reusing a driver already paired to another vehicle', async () => {
    const service = makeService({
      vehicle: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'vehicle-id',
          assignedDriverId: null,
          isDeleted: false,
          assignedDriver: null,
        }),
      },
      driver: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'driver-id',
          licenseExpiry: new Date('2035-12-31'),
          staff: activeStaff,
          vehicle: { id: 'other-vehicle-id' },
        }),
      },
    } as never);

    await expect(
      service.designateDriver('vehicle-id', 'driver-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires an eligible pair before a vehicle becomes available', async () => {
    const service = makeService({
      vehicle: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'vehicle-id',
          isDeleted: false,
          assignedDriver: null,
        }),
      },
    } as never);

    await expect(
      service.updateVehicleStatus('vehicle-id', VehicleStatus.AVAILABLE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a designated active vehicle before a driver becomes available', async () => {
    const service = makeService({
      driver: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'driver-id',
          licenseExpiry: new Date('2035-12-31'),
          staff: activeStaff,
          vehicle: null,
        }),
      },
    } as never);

    await expect(
      service.updateDriverStatus('driver-id', DriverStatus.AVAILABLE),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks Staff users from listing deleted vehicles', async () => {
    const service = makeService({} as never);

    await expect(
      service.listVehicles(
        { page: 1, limit: 20, includeDeleted: true },
        UserRole.STAFF,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns paginated vehicle results', async () => {
    const service = makeService({
      vehicle: {
        findMany: vi.fn().mockResolvedValue([{ id: 'vehicle-id' }]),
        count: vi.fn().mockResolvedValue(21),
      },
    } as never);

    await expect(
      service.listVehicles(
        { page: 2, limit: 20, includeDeleted: false },
        UserRole.ADMIN,
      ),
    ).resolves.toEqual({
      data: [{ id: 'vehicle-id' }],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });
  });
});
