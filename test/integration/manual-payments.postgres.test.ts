import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { AccountStatus, AssignmentStatus, BookingStatus, BookingType, DriverStatus, EmploymentStatus, FuelType, PaymentChannel, PaymentMethod, PaymentStatus, UserRole, VehicleStatus, VehicleTypeName } from '../../src/generated/prisma/enums.js';
import { AssignmentsService } from '../../src/assignments/assignments.service.js';
import { PaymentsService } from '../../src/payments/payments.service.js';
import { DriverService } from '../../src/driver/driver.service.js';

const connectionString = process.env.ROAMIGO_TEST_DATABASE_URL;
if (!connectionString || process.env.ROAMIGO_ALLOW_DATABASE_TESTS !== 'yes') {
  throw new Error('Set ROAMIGO_TEST_DATABASE_URL and ROAMIGO_ALLOW_DATABASE_TESTS=yes for the dedicated database suite');
}
const target = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/^\/[a-zA-Z0-9_]+_test$/.test(target.pathname)) {
  throw new Error('Database tests require a local disposable database with a name ending in _test');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const assignments = new AssignmentsService(prisma as never);
const payments = new PaymentsService(prisma as never, assignments);
const drivers = new DriverService(prisma as never, assignments);
const actorUserId = randomUUID();
const customerUserId = randomUUID();
const driverUserId = randomUUID();
const vehicleId = randomUUID();
const driverId = randomUUID();
const marker = randomUUID();
let vehicleTypeId: string;

describe('Manual payments and allocation on isolated Postgres', () => {
  beforeAll(async () => {
    if (await prisma.userProfile.count()) {
      throw new Error('Use a freshly migrated disposable database without application records');
    }
    for (const [userId, role] of [[actorUserId, UserRole.ADMIN], [customerUserId, UserRole.CUSTOMER], [driverUserId, UserRole.STAFF]] as const) {
      await prisma.authUser.create({ data: { id: userId } });
      await prisma.userProfile.create({ data: {
        userId, role, accountStatus: AccountStatus.ACTIVE, firstName: 'Fixture', lastName: marker,
      } });
    }
    const type = await prisma.vehicleType.upsert({ where: { vehicleType: VehicleTypeName.VAN }, update: {}, create: { vehicleType: VehicleTypeName.VAN } });
    vehicleTypeId = type.id;
    const staff = await prisma.staff.create({ data: { userId: driverUserId, employmentStatus: EmploymentStatus.ACTIVE } });
    await prisma.driver.create({ data: { id: driverId, staffId: staff.id, licenseNumber: marker, licenseExpiry: new Date('2099-12-31'), driverStatus: DriverStatus.AVAILABLE } });
    await prisma.vehicle.create({ data: {
      id: vehicleId, vehicleTypeId, assignedDriverId: driverId, plateNumber: marker.slice(0, 20), fuelType: FuelType.DIESEL,
      fuelEfficiency: '10.00', vehicleModel: 'Fixture van', passengerCapacity: 10, yearModel: 2026, color: 'White', vehicleStatus: VehicleStatus.AVAILABLE,
    } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function booking(day: number, hour = 8, createdAt = new Date('2098-01-01')) {
    return prisma.booking.create({ data: {
      customerUserId, vehicleTypeId, bookingType: BookingType.CUSTOM_TRIP,
      startDatetime: new Date(Date.UTC(2099, 0, day, hour)), endDatetime: new Date(Date.UTC(2099, 0, day, hour + 2)),
      passengerCount: 4, bookingStatus: BookingStatus.AWAITING_PAYMENT,
      totalDistanceKm: '10.00', estimatedDurationMinutes: 120, finalQuotedPrice: '1200.00', createdAt,
    } });
  }

  it('concurrent approval commits one audit decision and assignment request', async () => {
    const trip = await booking(1);
    const receipt = await payments.record(actorUserId, trip.id, {
      method: PaymentMethod.BANK_TRANSFER, reference: randomUUID(), amount: '1200.00', reason: 'Synthetic test receipt',
    });
    await Promise.all([
      payments.review(actorUserId, receipt.id, true, { reason: 'Synthetic received funds' }),
      payments.review(actorUserId, receipt.id, true, { reason: 'Synthetic received funds retry' }),
    ]);
    expect(await prisma.paymentAudit.count({ where: { paymentId: receipt.id, action: 'DECIDED' } })).toBe(1);
    expect(await prisma.assignmentRequest.count({ where: { bookingId: trip.id } })).toBe(1);
    expect(await prisma.bookingAssignment.count({ where: { bookingId: trip.id } })).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: trip.id } })).bookingStatus).toBe(BookingStatus.DISPATCHED);
    const decision = await prisma.paymentAudit.findFirstOrThrow({ where: { paymentId: receipt.id, action: 'DECIDED' } });
    await expect(prisma.paymentAudit.update({ where: { id: decision.id }, data: { reason: 'Modified' } })).rejects.toBeDefined();
  });

  it('overlapping paid requests allocate only the older original submission', async () => {
    const older = await booking(2, 8, new Date('2098-01-01'));
    const newer = await booking(2, 8, new Date('2098-01-02'));
    for (const trip of [older, newer]) {
      await prisma.payment.create({ data: {
        bookingId: trip.id, paymentChannel: PaymentChannel.MANUAL, paymentMethod: PaymentMethod.CASH,
        amount: '1200.00', currency: 'PHP', paymentStatus: PaymentStatus.PAID, paidAt: new Date(),
      } });
      await prisma.booking.update({ where: { id: trip.id }, data: { bookingStatus: BookingStatus.PAID_AWAITING_ASSIGNMENT } });
      await prisma.assignmentRequest.create({ data: { bookingId: trip.id, actorUserId } });
    }
    await Promise.all([assignments.process(newer.id), assignments.process(older.id)]);
    expect(await prisma.bookingAssignment.count({ where: { bookingId: { in: [older.id, newer.id] } } })).toBe(1);
    expect((await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: older.id, assignmentStatus: AssignmentStatus.ASSIGNED } })).driverId).toBe(driverId);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: newer.id } })).bookingStatus).toBe(BookingStatus.PAID_AWAITING_ASSIGNMENT);
  });

  it('database constraints reject competing overlap writes even outside the allocator', async () => {
    const first = await booking(3);
    const second = await booking(3);
    const insert = (trip: typeof first) => prisma.bookingAssignment.create({ data: {
      bookingId: trip.id, vehicleId, driverId, assignmentStatus: AssignmentStatus.ASSIGNED,
      reservedFrom: trip.startDatetime, reservedUntil: trip.endDatetime,
    } });
    const results = await Promise.allSettled([insert(first), insert(second)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('permits adjacent intervals and blocks invalidating active resource changes', async () => {
    for (const hour of [8, 10]) {
      const trip = await booking(4, hour);
      await prisma.bookingAssignment.create({ data: {
        bookingId: trip.id, vehicleId, driverId, assignmentStatus: AssignmentStatus.ASSIGNED,
        reservedFrom: trip.startDatetime, reservedUntil: trip.endDatetime,
      } });
    }
    await expect(prisma.vehicle.update({ where: { id: vehicleId }, data: { vehicleStatus: VehicleStatus.UNAVAILABLE } })).rejects.toBeDefined();
  });

  it('automatically dispatches with owned reads and preserves decline/replacement history', async () => {
    const trip = await booking(5);
    const receipt = await payments.record(actorUserId, trip.id, { method: PaymentMethod.CASH, reference: randomUUID(), amount: '1200.00', reason: 'Synthetic receipt' });
    await payments.review(actorUserId, receipt.id, true, { reason: 'Synthetic funds checked' });
    const original = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: trip.id, assignmentStatus: AssignmentStatus.ASSIGNED } });
    expect(original.responseDeadline!.getTime()).toBeGreaterThan(original.dispatchedAt!.getTime());
    expect(await prisma.driverEvent.count({ where: { assignmentId: original.id, action: 'DISPATCHED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientUserId: driverUserId, actionUrl: `/driver/assignments/${original.id}` } })).toBe(1);

    const replacementUser = randomUUID();
    await prisma.authUser.create({ data: { id: replacementUser } });
    await prisma.userProfile.create({ data: { userId: replacementUser, firstName: 'Fixture', lastName: marker, role: UserRole.STAFF, accountStatus: AccountStatus.ACTIVE } });
    const staff = await prisma.staff.create({ data: { userId: replacementUser, employmentStatus: EmploymentStatus.ACTIVE } });
    const replacement = await prisma.driver.create({ data: { staffId: staff.id, licenseNumber: randomUUID(), licenseExpiry: new Date('2099-12-31'), driverStatus: DriverStatus.UNAVAILABLE } });
    await expect(drivers.detail(replacementUser, original.id)).rejects.toMatchObject({ status: 404 });
    await drivers.act(driverUserId, original.id, 'DECLINED', 'Synthetic unavailability');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: trip.id } })).bookingStatus).toBe(BookingStatus.RECOVERY_REQUIRED);

    await prisma.vehicle.create({ data: {
      vehicleTypeId, assignedDriverId: replacement.id, plateNumber: randomUUID().slice(0, 20), fuelType: FuelType.DIESEL,
      fuelEfficiency: '10.00', vehicleModel: 'Replacement fixture', passengerCapacity: 10, yearModel: 2026, color: 'White', vehicleStatus: VehicleStatus.AVAILABLE,
    } });
    await prisma.driver.update({ where: { id: replacement.id }, data: { driverStatus: DriverStatus.AVAILABLE } });
    await assignments.retry(actorUserId, trip.id);
    const history = await prisma.bookingAssignment.findMany({ where: { bookingId: trip.id } });
    expect(history).toHaveLength(2);
    expect(history.find((entry) => entry.id === original.id)?.assignmentStatus).toBe(AssignmentStatus.DECLINED);
    const current = history.find((entry) => entry.assignmentStatus === AssignmentStatus.ASSIGNED)!;
    expect(current.driverId).toBe(replacement.id);
    await expect(drivers.detail(driverUserId, original.id)).resolves.toMatchObject({ customerContact: null, stops: [] });
    await expect(drivers.detail(replacementUser, current.id)).resolves.toHaveProperty('responseDeadline');
  });

  it('expires a response once and records a system recovery event', async () => {
    const trip = await booking(6);
    await prisma.payment.create({ data: { bookingId: trip.id, paymentChannel: PaymentChannel.MANUAL, paymentMethod: PaymentMethod.CASH, amount: '1200.00', paymentStatus: PaymentStatus.PAID } });
    await prisma.booking.update({ where: { id: trip.id }, data: { bookingStatus: BookingStatus.DISPATCHED } });
    await prisma.assignmentRequest.create({ data: { bookingId: trip.id, actorUserId, completedAt: new Date() } });
    const expired = await prisma.bookingAssignment.create({ data: {
      bookingId: trip.id, vehicleId, driverId, assignmentStatus: AssignmentStatus.ASSIGNED, tripState: 'DISPATCHED',
      reservedFrom: trip.startDatetime, reservedUntil: trip.endDatetime,
      dispatchedAt: new Date(Date.now() - 10800000), responseDeadline: new Date(Date.now() - 3600000),
    } });
    await drivers.processExpired(undefined, 100);
    await drivers.processExpired(undefined, 100);
    const events = await prisma.driverEvent.findMany({ where: { assignmentId: expired.id, action: 'EXPIRED' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorSource: 'SYSTEM', actorUserId: null });
    expect((await prisma.bookingAssignment.findUniqueOrThrow({ where: { id: expired.id } })).assignmentStatus).toBe(AssignmentStatus.DECLINED);
  });

  it('completes a trip atomically and prevents availability overrides during turnaround', async () => {
    const trip = await prisma.booking.create({ data: {
      customerUserId, vehicleTypeId, bookingType: BookingType.CUSTOM_TRIP, passengerCount: 4,
      startDatetime: new Date(Date.now() - 3600000), endDatetime: new Date(Date.now() + 7200000),
      bookingStatus: BookingStatus.AWAITING_PAYMENT, totalDistanceKm: '10.00', estimatedDurationMinutes: 180, finalQuotedPrice: '1200.00',
    } });
    const receipt = await payments.record(actorUserId, trip.id, { method: PaymentMethod.CASH, reference: randomUUID(), amount: '1200.00', reason: 'Synthetic receipt' });
    await payments.review(actorUserId, receipt.id, true, { reason: 'Synthetic received funds' });
    const active = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: trip.id, assignmentStatus: AssignmentStatus.ASSIGNED }, include: { driver: { include: { staff: true } } } });
    const actor = active.driver.staff.userId;
    for (const action of ['ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED', 'STARTED', 'ENDED'] as const) await drivers.act(actor, active.id, action);
    await drivers.act(actor, active.id, 'ENDED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: trip.id } })).bookingStatus).toBe(BookingStatus.COMPLETED);
    expect((await prisma.resourceHold.findUniqueOrThrow({ where: { assignmentId: active.id } })).phase).toBe('TURNAROUND');
    expect(await prisma.driverEvent.count({ where: { assignmentId: active.id, action: 'ENDED' } })).toBe(1);
    const completion = await prisma.travelSlip.findUniqueOrThrow({ where: { bookingAssignmentId: active.id } });
    expect(completion.completionSnapshot).toMatchObject({ version: 1, bookingId: trip.id, driverId: active.driverId, originalQuotedAmount: '1200.00' });
    await expect(prisma.travelSlip.update({ where: { id: completion.id }, data: { remarks: 'Changed afterwards' } })).rejects.toBeDefined();
    await expect(prisma.vehicle.update({ where: { id: active.vehicleId }, data: { vehicleStatus: VehicleStatus.AVAILABLE } })).rejects.toBeDefined();
    await expect(prisma.driver.update({ where: { id: active.driverId }, data: { driverStatus: DriverStatus.AVAILABLE } })).rejects.toBeDefined();
  });

  it('denies direct shared-role access to application records', async () => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await expect(client.query('SELECT driver_id FROM public.driver')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
