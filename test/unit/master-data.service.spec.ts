import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountStatus, BookingType, UserRole, VehicleTypeName } from '../../src/generated/prisma/enums.js';
import { VehicleTypesService } from '../../src/vehicle-types/vehicle-types.service.js';
import { PricingConfigurationsService } from '../../src/pricing/pricing-configurations.service.js';
import { BookingOptionsService } from '../../src/booking-options/booking-options.service.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';

describe('Master-data administration', () => {
  function setup() {
    const type = { id: 'type', vehicleType: VehicleTypeName.VAN, isActive: true };
    const price = { id: 'price', vehicleTypeId: 'type', isActive: false, effectiveFrom: new Date('2099-01-01'), effectiveUntil: null };
    const tx = {
      $queryRaw: vi.fn(), userProfile: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: null }) },
      vehicleType: { create: vi.fn().mockResolvedValue({ ...type, isActive: false }), findUnique: vi.fn().mockResolvedValue(type), update: vi.fn().mockResolvedValue({ ...type, isActive: false }), findMany: vi.fn().mockResolvedValue([]) },
      pricingConfiguration: { create: vi.fn().mockResolvedValue(price), findUnique: vi.fn().mockResolvedValue(price), update: vi.fn().mockResolvedValue({ ...price, isActive: true }), count: vi.fn().mockResolvedValue(0), findMany: vi.fn() },
      masterDataAudit: { create: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    return { types: new VehicleTypesService(prisma as never), prices: new PricingConfigurationsService(prisma as never), options: new BookingOptionsService(prisma as never), tx, type, price, prisma };
  }
  it('creates inactive supported categories and audits their creation', async () => {
    const { types, tx } = setup(); await types.create('admin', { vehicleType: VehicleTypeName.VAN });
    expect(tx.vehicleType.create).toHaveBeenCalledWith({ data: { vehicleType: VehicleTypeName.VAN, isActive: false } });
    expect(tx.masterDataAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin', action: 'CREATE', recordType: 'VEHICLE_TYPE' }) });
  });
  it('returns a conflict for duplicate category creation without an audit', async () => {
    const { types, tx } = setup(); tx.vehicleType.create.mockRejectedValue({ code: 'P2002' });
    await expect(types.create('admin', { vehicleType: VehicleTypeName.VAN })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
  });
  it('locks lifecycle changes, preserves category identity and avoids duplicate status audits', async () => {
    const { types, tx, type } = setup();
    await types.update('admin', 'type', { isActive: false });
    expect(tx.vehicleType.update).toHaveBeenCalledWith({ where: { id: 'type' }, data: { isActive: false } });
    expect(tx.masterDataAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ before: type, action: 'DEACTIVATE' }) });
    tx.masterDataAudit.create.mockClear();
    await types.update('admin', 'type', { isActive: true });
    expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
  });
  it('denies driver-linked Administrators at the data layer', async () => {
    const { types, prices, tx } = setup();
    tx.userProfile.findUnique.mockResolvedValue({ role: UserRole.ADMIN, accountStatus: AccountStatus.ACTIVE, staff: { driver: {} } } as never);
    await expect(types.update('actor', 'type', { isActive: false })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(prices.setActive('actor', 'price', true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
  });
  it('serializes pricing activation by category and audits both snapshots', async () => {
    const { prices, tx, price } = setup(); await prices.setActive('admin', 'price', true);
    expect(tx.$queryRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(tx.pricingConfiguration.count.mock.invocationCallOrder[0]!);
    expect(tx.pricingConfiguration.update).toHaveBeenCalledWith({ where: { id: 'price' }, data: { isActive: true, updatedByAdminId: 'admin' } });
    expect(tx.masterDataAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ before: expect.objectContaining({ id: price.id }), after: expect.objectContaining({ isActive: true }), action: 'ACTIVATE' }) });
  });
  it('does not mutate or audit overlapping pricing activation', async () => {
    const { prices, tx } = setup(); tx.pricingConfiguration.count.mockResolvedValue(1);
    await expect(prices.setActive('admin', 'price', true)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pricingConfiguration.update).not.toHaveBeenCalled(); expect(tx.masterDataAudit.create).not.toHaveBeenCalled();
  });
  it('keeps inactive categories out of customer options and emits only catalog fields', async () => {
    const { options, tx } = setup();
    tx.vehicleType.findMany.mockResolvedValue([{ id: 'type', vehicleType: VehicleTypeName.VAN, vehicles: [{ passengerCapacity: 10 }] }] as never);
    expect(await options.vehicleTypes()).toEqual([{ id: 'type', name: VehicleTypeName.VAN, maximumPassengerCapacity: 10 }]);
    expect(tx.vehicleType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, vehicles: { some: { isDeleted: false } } } }));
  });
  it('rejects new quotes for an inactive category before pricing', async () => {
    const { prisma, tx } = setup(); tx.vehicleType.findUnique.mockResolvedValue({ id: 'type', vehicleType: VehicleTypeName.VAN, isActive: false });
    const pricing = { quote: vi.fn() }; const bookings = new BookingsService(prisma as never, pricing as never, {} as never);
    await expect(bookings.issueQuote('customer', { bookingType: BookingType.TOUR_PACKAGE, tourPackageId: 'package', vehicleTypeId: 'type', startDatetime: '2099-01-01T08:00:00Z', endDatetime: '2099-01-01T10:00:00Z', passengerCount: 1 })).rejects.toMatchObject({ status: 400 });
    expect(pricing.quote).not.toHaveBeenCalled();
  });
});
