import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AccountStatus,
  DriverStatus,
  EmploymentStatus,
  UserRole,
  VehicleStatus,
} from '../../src/generated/prisma/enums.js';
import { StaffService } from '../../src/staff/staff.service.js';

const staffId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

describe('StaffService', () => {
  it('creates an active Staff profile for an existing auth user', async () => {
    const create = vi.fn().mockResolvedValue({
      staff: { id: staffId, employmentStatus: EmploymentStatus.ACTIVE },
    });
    const service = new StaffService({
      authUser: {
        findUnique: vi.fn().mockResolvedValue({ id: userId, profile: null }),
      },
      userProfile: { create },
    } as never);

    await expect(
      service.create({
        userId,
        firstName: 'Mina',
        lastName: 'Santos',
        phoneNumber: '+639171234567',
        birthDate: '1998-04-12',
        homeAddress: 'Baguio City',
      }),
    ).resolves.toEqual({
      id: staffId,
      employmentStatus: EmploymentStatus.ACTIVE,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          role: UserRole.STAFF,
          accountStatus: AccountStatus.ACTIVE,
          birthDate: new Date('1998-04-12'),
          staff: {
            create: { employmentStatus: EmploymentStatus.ACTIVE },
          },
        }),
      }),
    );
  });

  it('rejects onboarding when the Supabase auth user does not exist', async () => {
    const create = vi.fn();
    const service = new StaffService({
      authUser: { findUnique: vi.fn().mockResolvedValue(null) },
      userProfile: { create },
    } as never);

    await expect(
      service.create({
        userId,
        firstName: 'Mina',
        lastName: 'Santos',
        phoneNumber: '+639171234567',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not replace an existing application profile', async () => {
    const create = vi.fn();
    const service = new StaffService({
      authUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          profile: { userId },
        }),
      },
      userProfile: { create },
    } as never);

    await expect(
      service.create({
        userId,
        firstName: 'Mina',
        lastName: 'Santos',
        phoneNumber: '+639171234567',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns filtered and paginated Staff records', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: staffId }]);
    const count = vi.fn().mockResolvedValue(21);
    const service = new StaffService({
      staff: { findMany, count },
    } as never);

    await expect(
      service.list({
        search: 'mina',
        employmentStatus: EmploymentStatus.ACTIVE,
        accountStatus: AccountStatus.ACTIVE,
        hasDriver: false,
        page: 2,
        limit: 20,
      }),
    ).resolves.toEqual({
      data: [{ id: staffId }],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employmentStatus: EmploymentStatus.ACTIVE,
          driver: { is: null },
        }),
        skip: 20,
        take: 20,
      }),
    );
  });

  it('rejects an empty profile update', async () => {
    const service = new StaffService({} as never);

    await expect(service.updateProfile(staffId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks deactivation when the Driver has an active assignment', async () => {
    const transaction = vi.fn();
    const service = new StaffService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: staffId,
          userId,
          employmentStatus: EmploymentStatus.ACTIVE,
          driver: { id: 'driver-id', vehicle: null },
        }),
      },
      bookingAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'assignment-id' }),
      },
      $transaction: transaction,
    } as never);

    await expect(
      service.updateEmploymentStatus(staffId, EmploymentStatus.INACTIVE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deactivates access, Driver, and the designated vehicle atomically', async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    const vehicleUpdate = vi.fn().mockResolvedValue({});
    const driverUpdate = vi.fn().mockResolvedValue({});
    const staffUpdate = vi.fn().mockResolvedValue({
      id: staffId,
      employmentStatus: EmploymentStatus.INACTIVE,
    });
    const tx = {
      userProfile: { update: userUpdate },
      vehicle: { update: vehicleUpdate },
      driver: { update: driverUpdate },
      staff: { update: staffUpdate },
    };
    const service = new StaffService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: staffId,
          userId,
          employmentStatus: EmploymentStatus.ACTIVE,
          driver: {
            id: 'driver-id',
            vehicle: { id: 'vehicle-id' },
          },
        }),
      },
      bookingAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as never);

    await service.updateEmploymentStatus(
      staffId,
      EmploymentStatus.INACTIVE,
    );

    expect(userUpdate).toHaveBeenCalledWith({
      where: { userId },
      data: { accountStatus: AccountStatus.INACTIVE },
    });
    expect(vehicleUpdate).toHaveBeenCalledWith({
      where: { id: 'vehicle-id' },
      data: {
        assignedDriverId: null,
        vehicleStatus: VehicleStatus.UNAVAILABLE,
      },
    });
    expect(driverUpdate).toHaveBeenCalledWith({
      where: { id: 'driver-id' },
      data: { driverStatus: DriverStatus.INACTIVE },
    });
    expect(staffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: staffId },
        data: { employmentStatus: EmploymentStatus.INACTIVE },
      }),
    );
  });

  it('reactivates account access without automatically reactivating a Driver', async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    const driverUpdate = vi.fn();
    const staffUpdate = vi.fn().mockResolvedValue({
      id: staffId,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    const tx = {
      userProfile: { update: userUpdate },
      vehicle: { update: vi.fn() },
      driver: { update: driverUpdate },
      staff: { update: staffUpdate },
    };
    const service = new StaffService({
      staff: {
        findUnique: vi.fn().mockResolvedValue({
          id: staffId,
          userId,
          employmentStatus: EmploymentStatus.SUSPENDED,
          driver: { id: 'driver-id', vehicle: null },
        }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as never);

    await service.updateEmploymentStatus(staffId, EmploymentStatus.ACTIVE);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { userId },
      data: { accountStatus: AccountStatus.ACTIVE },
    });
    expect(driverUpdate).not.toHaveBeenCalled();
  });
});
