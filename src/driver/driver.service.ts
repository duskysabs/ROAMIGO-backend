import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AccountStatus, AssignmentStatus, BookingStatus, DriverStatus, EmploymentStatus, NotificationType, TravelSlipStatus, UserRole, VehicleStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { requireStaffOperator } from '../common/staff-operator.js';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';

export type DriverAction = 'ACKNOWLEDGED' | 'DECLINED' | 'EN_ROUTE' | 'ARRIVED' | 'STARTED' | 'ENDED';
const predecessor: Record<DriverAction, string> = {
  ACKNOWLEDGED: 'DISPATCHED', DECLINED: 'DISPATCHED', EN_ROUTE: 'ACKNOWLEDGED',
  ARRIVED: 'EN_ROUTE', STARTED: 'ARRIVED', ENDED: 'STARTED',
};
const assignmentRead = {
  vehicle: { select: { id: true, assignedDriverId: true, plateNumber: true, vehicleModel: true, vehicleStatus: true } },
  driver: { select: { staff: { select: { userId: true } } } },
  booking: { select: {
    id: true, bookingStatus: true, startDatetime: true, endDatetime: true, passengerCount: true, customerUserId: true,
    customer: { select: { firstName: true, lastName: true, phoneNumber: true } },
    stops: { orderBy: { sequenceNumber: 'asc' }, select: { sequenceNumber: true, locationName: true, formattedAddress: true, latitude: true, longitude: true, stopType: true } },
  } },
  travelSlip: { select: { actualTripStartAt: true, actualTripEndAt: true, travelSlipStatus: true, completedAt: true } },
} satisfies Prisma.BookingAssignmentInclude;
type AssignedTrip = Prisma.BookingAssignmentGetPayload<{ include: typeof assignmentRead }>;

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService, private readonly assignments: AssignmentsService) {}

  private async principal(tx: Pick<Prisma.TransactionClient, 'driver'>, userId: string) {
    const driver = await tx.driver.findFirst({
      where: { driverStatus: { not: DriverStatus.INACTIVE }, staff: { is: {
        userId, employmentStatus: EmploymentStatus.ACTIVE,
        user: { is: { accountStatus: AccountStatus.ACTIVE, role: { in: [UserRole.STAFF, UserRole.DRIVER] } } },
      } } },
      include: { vehicle: { select: { id: true, plateNumber: true, vehicleModel: true } } },
    });
    if (!driver) throw new ForbiddenException('An active Driver profile is required');
    return driver;
  }

  async me(userId: string) {
    const driver = await this.principal(this.prisma, userId);
    return { driverId: driver.id, driverStatus: driver.driverStatus, vehicle: driver.vehicle };
  }

  async list(userId: string, query: CursorPageQueryDto) {
    const driver = await this.principal(this.prisma, userId);
    const rows = await this.prisma.bookingAssignment.findMany({
      where: { driverId: driver.id, dispatchedAt: { not: null } }, include: assignmentRead,
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit);
    return { items: items.map((row) => this.view(row, false)), nextCursor: rows.length > query.limit ? items.at(-1)?.id ?? null : null };
  }

  async detail(userId: string, assignmentId: string) {
    const driver = await this.principal(this.prisma, userId);
    const assignment = await this.prisma.bookingAssignment.findFirst({ where: { id: assignmentId, driverId: driver.id, dispatchedAt: { not: null } }, include: assignmentRead });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.view(assignment, true);
  }

  async navigation(userId: string, assignmentId: string, sequence: number) {
    const driver = await this.principal(this.prisma, userId);
    const assignment = await this.prisma.bookingAssignment.findFirst({ where: { id: assignmentId, driverId: driver.id, dispatchedAt: { not: null } }, include: assignmentRead });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (!this.isCurrent(assignment)) throw new ConflictException('Navigation is unavailable for a closed assignment');
    const stop = assignment.booking.stops.find((item) => item.sequenceNumber === sequence);
    if (!stop) throw new NotFoundException('Approved stop not found');
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('destination', `${stop.latitude.toString()},${stop.longitude.toString()}`);
    url.searchParams.set('travelmode', 'driving');
    return { url: url.toString(), stopSequence: sequence, external: true };
  }

  async completion(operatorUserId: string, assignmentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await requireStaffOperator(tx, operatorUserId);
      const record = await tx.travelSlip.findUnique({ where: { bookingAssignmentId: assignmentId }, select: {
        bookingAssignmentId: true, actualTripStartAt: true, actualTripEndAt: true, completedAt: true,
        travelSlipStatus: true, remarks: true, completionSnapshot: true,
      } });
      if (!record || record.travelSlipStatus !== TravelSlipStatus.COMPLETED) throw new NotFoundException('Trip Completion Record not found');
      return record;
    });
  }

  async act(userId: string, assignmentId: string, action: DriverAction, reason?: string) {
    if (action === 'DECLINED' && (!reason || reason.trim().length < 3)) throw new BadRequestException('A decline reason is required');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(721033)::text`;
      const driver = await this.principal(tx, userId);
      const initial = await tx.bookingAssignment.findFirst({ where: { id: assignmentId, driverId: driver.id }, select: { bookingId: true } });
      if (!initial) throw new NotFoundException('Assignment not found');
      await this.lock(tx, initial.bookingId, assignmentId);
      const assignment = await tx.bookingAssignment.findFirst({ where: { id: assignmentId, driverId: driver.id }, include: assignmentRead });
      if (!assignment?.dispatchedAt) throw new NotFoundException('Assignment not found');
      const existing = await tx.driverEvent.findUnique({ where: { assignmentId_action: { assignmentId, action } } });
      if (existing) return { assignmentId, bookingId: assignment.bookingId, tripState: assignment.tripState, recovery: action === 'DECLINED' };
      const now = new Date();
      if (assignment.tripState !== predecessor[action] || !this.isCurrent(assignment)) throw new ConflictException('Invalid or stale Driver action');
      if ((action === 'ACKNOWLEDGED' || action === 'DECLINED') && (!assignment.responseDeadline || assignment.responseDeadline <= now)) {
        throw new ConflictException('The Driver response deadline has elapsed');
      }
      if (assignment.vehicle.assignedDriverId !== driver.id) throw new ConflictException('The designated pair requires recovery');
      if (action === 'DECLINED') {
        await this.failResponse(tx, assignment, 'DECLINED', userId, reason!);
        return { assignmentId, bookingId: assignment.bookingId, tripState: 'DECLINED', recovery: true };
      }
      if (action === 'EN_ROUTE' || action === 'ARRIVED' || action === 'STARTED') {
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if (driver.licenseExpiry < today) throw new ConflictException('Driver licence has expired');
        if (driver.driverStatus !== DriverStatus.AVAILABLE || assignment.vehicle.vehicleStatus !== VehicleStatus.AVAILABLE) throw new ConflictException('The designated resources are not ready');
        const hold = await tx.resourceHold.findFirst({ where: { releasedAt: null, OR: [{ vehicleId: assignment.vehicleId }, { driverId: driver.id }] }, select: { id: true } });
        if (hold) throw new ConflictException('The vehicle or Driver has an active operational hold');
      }
      if (action === 'STARTED') {
        if (now < assignment.booking.startDatetime || now >= assignment.booking.endDatetime) throw new ConflictException('Trip start is outside the scheduled interval');
        await tx.resourceHold.create({ data: { assignmentId, vehicleId: assignment.vehicleId, driverId: driver.id, phase: 'IN_TRIP' } });
        await tx.vehicle.update({ where: { id: assignment.vehicleId }, data: { vehicleStatus: VehicleStatus.IN_TRIP } });
        await tx.driver.update({ where: { id: driver.id }, data: { driverStatus: DriverStatus.IN_TRIP } });
        await tx.travelSlip.create({ data: { bookingAssignmentId: assignmentId, actualTripStartAt: now, travelSlipStatus: TravelSlipStatus.IN_PROGRESS } });
        await this.transition(tx, assignment, BookingStatus.IN_PROGRESS, userId, 'Driver started the assigned trip');
      }
      if (action === 'ENDED') {
        if (!assignment.travelSlip?.actualTripStartAt || assignment.booking.bookingStatus !== BookingStatus.IN_PROGRESS) throw new ConflictException('The trip has not started');
        const snapshot = await this.completionSnapshot(tx, assignment, assignment.travelSlip.actualTripStartAt, now, reason);
        await tx.travelSlip.update({ where: { bookingAssignmentId: assignmentId }, data: { actualTripEndAt: now, completedAt: now, travelSlipStatus: TravelSlipStatus.COMPLETED, remarks: reason, completionSnapshot: snapshot } });
        await tx.resourceHold.update({ where: { assignmentId }, data: { phase: 'TURNAROUND' } });
        await tx.vehicle.update({ where: { id: assignment.vehicleId }, data: { vehicleStatus: VehicleStatus.TURNAROUND } });
        await tx.driver.update({ where: { id: driver.id }, data: { driverStatus: DriverStatus.TURNAROUND } });
        await this.transition(tx, assignment, BookingStatus.COMPLETED, userId, 'Trip Completion Record submitted; turnaround remains blocked');
      }
      await tx.bookingAssignment.update({ where: { id: assignmentId }, data: {
        tripState: action,
        ...(action === 'ACKNOWLEDGED' ? { assignmentStatus: AssignmentStatus.ACKNOWLEDGED, respondedAt: now } : {}),
        ...(action === 'ENDED' ? { assignmentStatus: AssignmentStatus.COMPLETED } : {}),
      } });
      await tx.driverEvent.create({ data: { assignmentId, actorUserId: userId, action, reason } });
      return { assignmentId, bookingId: assignment.bookingId, tripState: action, recovery: false };
    });
    const recovery = result.recovery ? await this.assignments.process(result.bookingId) : null;
    return { assignmentId: result.assignmentId, bookingId: result.bookingId, tripState: result.tripState, recovery };
  }

  async processExpired(operatorUserId: string | undefined, limit: number) {
    if (operatorUserId) await this.prisma.$transaction((tx) => requireStaffOperator(tx, operatorUserId));
    const due = await this.prisma.bookingAssignment.findMany({
      where: { assignmentStatus: AssignmentStatus.ASSIGNED, tripState: 'DISPATCHED', responseDeadline: { lte: new Date() }, dispatchedAt: { not: null } },
      select: { id: true, bookingId: true }, orderBy: [{ responseDeadline: 'asc' }, { id: 'asc' }], take: limit,
    });
    const outcomes = [];
    for (const item of due) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(721033)::text`;
        await this.lock(tx, item.bookingId, item.id);
        const assignment = await tx.bookingAssignment.findFirst({ where: { id: item.id }, include: assignmentRead });
        if (!assignment || !this.isCurrent(assignment) || assignment.tripState !== 'DISPATCHED' || assignment.assignmentStatus !== AssignmentStatus.ASSIGNED || !assignment.responseDeadline || assignment.responseDeadline > new Date()) return false;
        await this.failResponse(tx, assignment, 'EXPIRED', null, 'Configured Driver response deadline elapsed');
        return true;
      });
      if (changed) outcomes.push({ assignmentId: item.id, recovery: await this.assignments.process(item.bookingId) });
    }
    return { processed: outcomes.length, outcomes };
  }

  private async failResponse(tx: Prisma.TransactionClient, assignment: AssignedTrip, action: 'DECLINED' | 'EXPIRED', actorUserId: string | null, reason: string) {
    await tx.bookingAssignment.update({ where: { id: assignment.id }, data: { assignmentStatus: AssignmentStatus.DECLINED, tripState: action, respondedAt: action === 'DECLINED' ? new Date() : null } });
    await tx.driverEvent.create({ data: { assignmentId: assignment.id, actorUserId, actorSource: actorUserId ? 'USER' : 'SYSTEM', action, reason } });
    await this.transition(tx, assignment, BookingStatus.RECOVERY_REQUIRED, actorUserId, reason);
    await tx.assignmentRequest.update({ where: { bookingId: assignment.bookingId }, data: { completedAt: null, isRecovery: true, lastFailure: `DRIVER_${action}` } });
    await tx.notification.create({ data: { recipientUserId: assignment.booking.customerUserId, notificationType: NotificationType.BOOKING, title: 'Your assignment is being updated', message: 'We are checking replacement transport for your booking.', actionUrl: `/bookings/${assignment.bookingId}` } });
    if (action === 'EXPIRED') await tx.notification.create({ data: { recipientUserId: assignment.driver.staff.userId, notificationType: NotificationType.BOOKING, title: 'Assignment response window ended', message: 'The assignment is being reviewed for replacement transport.', actionUrl: `/driver/assignments/${assignment.id}` } });
  }

  private async transition(tx: Prisma.TransactionClient, assignment: AssignedTrip, nextState: BookingStatus, actorUserId: string | null, reason: string) {
    await tx.booking.update({ where: { id: assignment.bookingId }, data: { bookingStatus: nextState } });
    await tx.bookingTransition.create({ data: { bookingId: assignment.bookingId, previousState: assignment.booking.bookingStatus, nextState, actorUserId, actorSource: actorUserId ? 'USER' : 'SYSTEM', reason } });
  }

  private async lock(tx: Prisma.TransactionClient, bookingId: string, assignmentId: string) {
    await tx.$queryRaw`SELECT booking_id FROM public.booking WHERE booking_id = ${bookingId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT booking_assignment_id FROM public.booking_assignment WHERE booking_assignment_id = ${assignmentId}::uuid FOR UPDATE`;
  }

  private async completionSnapshot(tx: Prisma.TransactionClient, assignment: AssignedTrip, startedAt: Date, endedAt: Date, notes?: string): Promise<Prisma.InputJsonValue> {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: assignment.bookingId }, select: {
      passengerCount: true, finalQuotedPrice: true, totalDistanceKm: true, estimatedDurationMinutes: true,
      quote: { select: { routeEvidence: true } },
      stops: { orderBy: { sequenceNumber: 'asc' }, select: { sequenceNumber: true, stopType: true, locationName: true, formattedAddress: true, latitude: true, longitude: true, additionalCharge: true } },
      payments: { select: { id: true, paymentStatus: true, amount: true, currency: true, paidAt: true } },
    } });
    return {
      version: 1, bookingId: assignment.bookingId, assignmentId: assignment.id, driverId: assignment.driverId, vehicleId: assignment.vehicleId,
      actualTripStartAt: startedAt.toISOString(), actualTripEndAt: endedAt.toISOString(), passengerCount: booking.passengerCount,
      quoteRouteEvidence: booking.quote?.routeEvidence ?? null,
      totalDistanceKm: booking.totalDistanceKm.toString(), estimatedDurationMinutes: booking.estimatedDurationMinutes,
      finalStops: booking.stops.map((stop) => ({ ...stop, latitude: stop.latitude.toString(), longitude: stop.longitude.toString(), additionalCharge: stop.additionalCharge?.toString() ?? null })),
      originalQuotedAmount: booking.finalQuotedPrice.toString(),
      paymentStates: booking.payments.map((payment) => ({ id: payment.id, status: payment.paymentStatus, amount: payment.amount.toString(), currency: payment.currency, paidAt: payment.paidAt?.toISOString() ?? null })),
      completionNotes: notes ?? null,
    };
  }

  private isCurrent(assignment: AssignedTrip) {
    return (assignment.assignmentStatus === AssignmentStatus.ASSIGNED || assignment.assignmentStatus === AssignmentStatus.ACKNOWLEDGED) &&
      (assignment.booking.bookingStatus === BookingStatus.DISPATCHED || assignment.booking.bookingStatus === BookingStatus.IN_PROGRESS);
  }

  private view(assignment: AssignedTrip, detail: boolean) {
    const current = this.isCurrent(assignment);
    return {
      id: assignment.id, bookingId: assignment.bookingId, assignmentStatus: assignment.assignmentStatus, tripState: assignment.tripState,
      dispatchedAt: assignment.dispatchedAt, responseDeadline: assignment.responseDeadline,
      startDatetime: assignment.booking.startDatetime, endDatetime: assignment.booking.endDatetime, passengerCount: assignment.booking.passengerCount,
      vehicle: { id: assignment.vehicle.id, plateNumber: assignment.vehicle.plateNumber, vehicleModel: assignment.vehicle.vehicleModel },
      ...(detail ? {
        stops: current ? assignment.booking.stops.map((stop) => ({ ...stop, latitude: stop.latitude.toString(), longitude: stop.longitude.toString() })) : [],
        customerContact: current ? assignment.booking.customer : null,
        travelSlip: assignment.travelSlip,
      } : {}),
    };
  }
}
