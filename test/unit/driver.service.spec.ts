import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DriverService } from '../../src/driver/driver.service.js';
import { AssignmentStatus, BookingStatus, DriverStatus, VehicleStatus } from '../../src/generated/prisma/enums.js';

describe('Driver-owned assignment and trip workflow', () => {
  function setup() {
    const now = Date.now();
    const assignment = {
      id: 'assignment', bookingId: 'booking', vehicleId: 'vehicle', driverId: 'driver',
      assignmentStatus: AssignmentStatus.ASSIGNED, tripState: 'DISPATCHED',
      dispatchedAt: new Date(now - 60000), responseDeadline: new Date(now + 7200000),
      vehicle: { id: 'vehicle', assignedDriverId: 'driver', vehicleStatus: VehicleStatus.AVAILABLE, plateNumber: 'TEST-001', vehicleModel: 'Van' },
      driver: { staff: { userId: 'driver-user' } },
      booking: {
        id: 'booking', bookingStatus: BookingStatus.DISPATCHED, customerUserId: 'customer',
        startDatetime: new Date(now - 3600000), endDatetime: new Date(now + 7200000), passengerCount: 4,
        customer: { firstName: 'Fixture', lastName: 'Customer', phoneNumber: 'test-contact' },
        stops: [{ sequenceNumber: 1, locationName: 'Pickup', formattedAddress: 'Fixture address', latitude: 10, longitude: 123, stopType: 'PICKUP' }],
      }, travelSlip: null,
    };
    const tx = {
      $queryRaw: vi.fn(),
      driver: { findFirst: vi.fn().mockResolvedValue({ id: 'driver', driverStatus: DriverStatus.AVAILABLE, licenseExpiry: new Date('2099-12-31'), vehicle: assignment.vehicle }), update: vi.fn() },
      bookingAssignment: { findFirst: vi.fn().mockResolvedValue(assignment), findMany: vi.fn().mockResolvedValue([assignment]), update: vi.fn() },
      driverEvent: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      resourceHold: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      vehicle: { update: vi.fn() }, travelSlip: { create: vi.fn(), update: vi.fn() },
      booking: { update: vi.fn(), findUniqueOrThrow: vi.fn().mockResolvedValue({ ...assignment.booking, finalQuotedPrice: '1200.00', totalDistanceKm: '10.00', estimatedDurationMinutes: 120, quote: null, payments: [] }) }, bookingTransition: { create: vi.fn() },
      assignmentRequest: { update: vi.fn() }, notification: { create: vi.fn() },
    };
    const prisma = { ...tx, $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const allocations = { process: vi.fn().mockResolvedValue({ status: 'PENDING', reason: 'NO_ELIGIBLE_PAIR' }) };
    return { service: new DriverService(prisma as never, allocations as never), tx, assignment, allocations };
  }

  it('scopes detail queries to the authenticated Driver', async () => {
    const { service, tx } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue(null as never);
    await expect(service.detail('driver-user', 'another-assignment')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.bookingAssignment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'another-assignment', driverId: 'driver', dispatchedAt: { not: null } } }));
  });

  it('returns operational DTOs without financial or internal actor records', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, booking: { ...assignment.booking, finalQuotedPrice: 'PRIVATE-PRICE', payments: ['PRIVATE-PAYMENT'] } } as never);
    const result = await service.detail('driver-user', 'assignment');
    expect(result).toHaveProperty('customerContact');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(result).not.toHaveProperty('driverId');
  });

  it('removes contact and route details from closed assignments', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, assignmentStatus: AssignmentStatus.DECLINED, tripState: 'DECLINED' });
    await expect(service.detail('driver-user', 'assignment')).resolves.toMatchObject({ customerContact: null, stops: [] });
  });

  it('acknowledges the current assignment and records an immutable action', async () => {
    const { service, tx } = setup();
    await expect(service.act('driver-user', 'assignment', 'ACKNOWLEDGED')).resolves.toMatchObject({ tripState: 'ACKNOWLEDGED' });
    expect(tx.bookingAssignment.update).toHaveBeenCalledWith({ where: { id: 'assignment' }, data: expect.objectContaining({ assignmentStatus: AssignmentStatus.ACKNOWLEDGED }) });
    expect(tx.driverEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'driver-user', action: 'ACKNOWLEDGED' }) });
  });

  it('does not repeat an already recorded action', async () => {
    const { service, tx } = setup();
    tx.driverEvent.findUnique.mockResolvedValue({ id: 'recorded-event' } as never);
    await service.act('driver-user', 'assignment', 'ACKNOWLEDGED');
    expect(tx.bookingAssignment.update).not.toHaveBeenCalled();
    expect(tx.driverEvent.create).not.toHaveBeenCalled();
  });

  it('rejects acknowledgement after the stored deadline', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, responseDeadline: new Date(Date.now() - 1) });
    await expect(service.act('driver-user', 'assignment', 'ACKNOWLEDGED')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.bookingAssignment.update).not.toHaveBeenCalled();
  });

  it('rejects skipped trip stages', async () => {
    const { service, tx } = setup();
    await expect(service.act('driver-user', 'assignment', 'STARTED')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.resourceHold.create).not.toHaveBeenCalled();
  });

  it('retains a declined assignment and requests distinguishable recovery', async () => {
    const { service, tx, allocations } = setup();
    await service.act('driver-user', 'assignment', 'DECLINED', 'Unable to take this trip');
    expect(tx.bookingAssignment.update).toHaveBeenCalledWith({ where: { id: 'assignment' }, data: expect.objectContaining({ assignmentStatus: AssignmentStatus.DECLINED }) });
    expect(tx.assignmentRequest.update).toHaveBeenCalledWith({ where: { bookingId: 'booking' }, data: expect.objectContaining({ isRecovery: true, completedAt: null }) });
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking' }, data: { bookingStatus: BookingStatus.RECOVERY_REQUIRED } });
    expect(allocations.process).toHaveBeenCalledWith('booking');
  });

  it('starts only after arrival and creates an operational hold and travel slip', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, assignmentStatus: AssignmentStatus.ACKNOWLEDGED, tripState: 'ARRIVED' });
    await service.act('driver-user', 'assignment', 'STARTED');
    expect(tx.resourceHold.create).toHaveBeenCalledWith({ data: expect.objectContaining({ phase: 'IN_TRIP' }) });
    expect(tx.travelSlip.create).toHaveBeenCalled();
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking' }, data: { bookingStatus: BookingStatus.IN_PROGRESS } });
  });

  it('does not start using resources still held by another trip', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, assignmentStatus: AssignmentStatus.ACKNOWLEDGED, tripState: 'ARRIVED' });
    tx.resourceHold.findFirst.mockResolvedValue({ id: 'other-hold' } as never);
    await expect(service.act('driver-user', 'assignment', 'STARTED')).rejects.toBeInstanceOf(ConflictException);
  });

  it('records completion before exposing it and leaves resources in turnaround', async () => {
    const { service, tx, assignment } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, assignmentStatus: AssignmentStatus.ACKNOWLEDGED, tripState: 'STARTED',
      booking: { ...assignment.booking, bookingStatus: BookingStatus.IN_PROGRESS }, travelSlip: { actualTripStartAt: new Date(Date.now() - 60000) } } as never);
    const result = await service.act('driver-user', 'assignment', 'ENDED', 'Trip completed');
    expect(tx.resourceHold.update).toHaveBeenCalledWith({ where: { assignmentId: 'assignment' }, data: { phase: 'TURNAROUND' } });
    expect(tx.vehicle.update).toHaveBeenCalledWith({ where: { id: 'vehicle' }, data: { vehicleStatus: VehicleStatus.TURNAROUND } });
    expect(tx.travelSlip.update.mock.invocationCallOrder[0]).toBeLessThan(tx.booking.update.mock.invocationCallOrder[0]!);
    expect(tx.travelSlip.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completionSnapshot: expect.objectContaining({ version: 1, originalQuotedAmount: '1200.00' }) }) }));
    expect(JSON.stringify(result)).not.toContain('1200.00');
  });

  it('builds navigation only from an approved owned stop', async () => {
    const { service } = setup();
    const result = await service.navigation('driver-user', 'assignment', 1);
    expect(result.url).toContain('destination=10%2C123');
    expect(result.external).toBe(true);
    await expect(service.navigation('driver-user', 'assignment', 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('processes a timeout with a system actor, not an invented human', async () => {
    const { service, tx, assignment, allocations } = setup();
    tx.bookingAssignment.findFirst.mockResolvedValue({ ...assignment, responseDeadline: new Date(Date.now() - 1) });
    await expect(service.processExpired(undefined, 20)).resolves.toMatchObject({ processed: 1 });
    expect(tx.driverEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'EXPIRED', actorSource: 'SYSTEM', actorUserId: null }) });
    expect(allocations.process).toHaveBeenCalledWith('booking');
  });
});
