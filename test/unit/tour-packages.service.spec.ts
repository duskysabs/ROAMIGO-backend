import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PackageStatus, StopType } from '../../src/generated/prisma/enums.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { TourPackagesService } from '../../src/tour-packages/tour-packages.service.js';

describe('TourPackagesService', () => {
  let service: TourPackagesService;
  const create = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const findMany = vi.fn();
  const deleteMany = vi.fn();
  const transaction = vi.fn();

  const stops = [
    { stopType: StopType.PICKUP, locationName: 'Pickup', activity: 'Meet', formattedAddress: 'A', latitude: 14.1, longitude: 121.1, defaultStopMinutes: 0 },
    { stopType: StopType.DROPOFF, locationName: 'Dropoff', activity: 'End', formattedAddress: 'B', latitude: 14.2, longitude: 121.2, defaultStopMinutes: 0 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    transaction.mockImplementation((callback) => callback({ packageStop: { deleteMany }, tourPackage: { update } }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TourPackagesService,
        { provide: PrismaService, useValue: { tourPackage: { create, findUnique, update, findMany }, packageStop: { deleteMany }, $transaction: transaction } },
      ],
    }).compile();
    service = module.get(TourPackagesService);
  });

  it('creates an inactive package with server-controlled stop sequence numbers', async () => {
    create.mockResolvedValue({ id: 'package-id' });
    await service.create('admin-user-id', { packageName: 'City tour', description: 'Description', basePrice: 1200, estimatedDurationMinutes: 240, stops });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        packageStatus: PackageStatus.INACTIVE,
        createdByAdmin: { connect: { userId: 'admin-user-id' } },
        stops: { create: expect.arrayContaining([expect.objectContaining({ sequenceNumber: 1 }), expect.objectContaining({ sequenceNumber: 2 })]) },
      }),
    }));
  });

  it('rejects malformed package routes before persistence', async () => {
    expect(() => service.create('admin-user-id', { packageName: 'Invalid', description: 'Description', basePrice: 1200, estimatedDurationMinutes: 240, stops: [...stops].reverse() })).toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('replaces stops atomically after confirming the package exists', async () => {
    findUnique.mockResolvedValue({ id: 'package-id' });
    update.mockResolvedValue({ id: 'package-id' });
    await service.replaceStops('package-id', { stops });
    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({ where: { tourPackageId: 'package-id' } });
  });

  it('does not update a package that does not exist', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.update('missing-package', { packageName: 'Updated' })).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
