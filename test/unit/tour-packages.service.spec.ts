import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountStatus, PackageStatus, StopType, UserRole } from '../../src/generated/prisma/enums.js';
import { TourPackagesService } from '../../src/tour-packages/tour-packages.service.js';

describe('Audited package management', () => {
  const stops = [
    { stopType: StopType.PICKUP, locationName: 'Pickup', activity: 'Meet', formattedAddress: 'A', latitude: 14.1, longitude: 121.1, defaultStopMinutes: 0 },
    { stopType: StopType.DROPOFF, locationName: 'Dropoff', activity: 'End', formattedAddress: 'B', latitude: 14.2, longitude: 121.2, defaultStopMinutes: 0 },
  ];
  function setup() {
    const before = { id: 'package', packageName: 'Synthetic', packageStatus: PackageStatus.INACTIVE, stops };
    const tx = {
      $queryRaw: vi.fn(),
      userProfile: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: null }) },
      tourPackage: { create: vi.fn().mockResolvedValue(before), findUnique: vi.fn().mockResolvedValue(before),
        update: vi.fn().mockResolvedValue({ ...before, packageName: 'Updated' }), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
      packageStop: { deleteMany: vi.fn() }, masterDataAudit: { create: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    return { service: new TourPackagesService(prisma as never), tx, before, prisma };
  }
  it('creates inactive packages and records the actor and resulting route snapshot atomically', async () => {
    const { service, tx } = setup();
    await service.create('admin', { packageName: 'Synthetic', description: 'Synthetic', basePrice: 1200, estimatedDurationMinutes: 120, stops });
    expect(tx.tourPackage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      packageStatus: PackageStatus.INACTIVE, createdByAdmin: { connect: { userId: 'admin' } },
      stops: { create: expect.arrayContaining([expect.objectContaining({ sequenceNumber: 1 }), expect.objectContaining({ sequenceNumber: 2 })]) },
    }) }));
    expect(tx.masterDataAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin', actorRole: 'ADMIN', recordType: 'TOUR_PACKAGE', action: 'CREATE', after: expect.objectContaining({ id: 'package' }) }) });
  });
  it('rejects malformed routes before persistence', () => {
    const { service, tx } = setup();
    expect(() => service.create('admin', { packageName: 'Bad', description: 'Bad', basePrice: 1200, estimatedDurationMinutes: 120, stops: [...stops].reverse() })).toThrow(BadRequestException);
    expect(tx.tourPackage.create).not.toHaveBeenCalled();
  });
  it('locks the package and records before/after route evidence during replacement', async () => {
    const { service, tx, prisma } = setup();
    await service.replaceStops('admin', 'package', { stops });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.packageStop.deleteMany).toHaveBeenCalledWith({ where: { tourPackageId: 'package' } });
    expect(tx.$queryRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(tx.packageStop.deleteMany.mock.invocationCallOrder[0]!);
    expect(tx.masterDataAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REPLACE_STOPS', before: expect.objectContaining({ stops }), after: expect.objectContaining({ id: 'package' }) }) });
  });
  it('does not update missing records', async () => {
    const { service, tx } = setup(); tx.tourPackage.findUnique.mockResolvedValue(null);
    await expect(service.update('admin', 'missing', { packageName: 'Updated' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.tourPackage.update).not.toHaveBeenCalled();
  });
  it.each([UserRole.STAFF, UserRole.CUSTOMER, UserRole.DRIVER])('denies %s mutation at the data layer', async (role) => {
    const { service, tx } = setup(); tx.userProfile.findUnique.mockResolvedValue({ role, accountStatus: AccountStatus.ACTIVE, staff: null });
    await expect(service.update('actor', 'package', {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
  });
  it('propagates an audit failure instead of reporting a successful mutation', async () => {
    const { service, tx } = setup(); tx.masterDataAudit.create.mockRejectedValue(new Error('Audit unavailable'));
    await expect(service.update('admin', 'package', { packageName: 'Updated' })).rejects.toThrow('Audit unavailable');
  });
  it('does not add an audit for a status replay and validates routes before activation', async () => {
    const { service, tx, before } = setup();
    await service.setStatus('admin', 'package', PackageStatus.INACTIVE);
    expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
    before.stops = [];
    await expect(service.setStatus('admin', 'package', PackageStatus.ACTIVE)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.tourPackage.update).not.toHaveBeenCalled();
  });
  it('projects customer catalogs without internal management fields', async () => {
    const { service, tx } = setup();
    tx.tourPackage.findMany.mockResolvedValue([{ id: 'package', packageName: 'Synthetic', description: 'Synthetic', basePrice: { toString: () => '1200.00' }, estimatedDurationMinutes: 120,
      createdByAdminId: 'private-actor', stops: stops.map((s, i) => ({ ...s, sequenceNumber: i + 1, latitude: { toString: () => String(s.latitude) }, longitude: { toString: () => String(s.longitude) } })) }] as never);
    const result = await service.findForCustomers();
    expect(tx.tourPackage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { packageStatus: PackageStatus.ACTIVE } }));
    expect(result[0]).not.toHaveProperty('createdByAdminId');
    expect(result[0]).not.toHaveProperty('packageStatus');
  });
});
