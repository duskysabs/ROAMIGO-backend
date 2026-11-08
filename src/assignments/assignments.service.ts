import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AccountStatus, AssignmentStatus, BookingStatus, EmploymentStatus, NotificationType, PaymentStatus, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { eligiblePairsWhere } from '../fleet/allocation-eligibility.js';
import { requireStaffOperator } from '../common/staff-operator.js';
import { DispatchPolicy } from './dispatch-policy.js';

export type AllocationResult = { bookingId: string; status: 'ASSIGNED' | 'PENDING' | 'COMPLETED'; reason: string | null };

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);
  constructor(private readonly prisma: PrismaService, private readonly policy: DispatchPolicy = new DispatchPolicy()) {}

  async pending(actorUserId: string, query: CursorPageQueryDto) {
    return this.prisma.$transaction(async (tx) => {
      await requireStaffOperator(tx, actorUserId);
      const rows = await tx.assignmentRequest.findMany({
        where: { completedAt: null },
        select: { bookingId: true, createdAt: true, attempts: true, lastFailure: true, isRecovery: true,
          booking: { select: { createdAt: true, startDatetime: true, endDatetime: true, bookingStatus: true } } },
        orderBy: [{ booking: { createdAt: 'asc' } }, { bookingId: 'asc' }], take: query.limit + 1,
        ...(query.cursor ? { cursor: { bookingId: query.cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.bookingId ?? null : null };
    });
  }

  async retry(actorUserId: string, bookingId: string) {
    await this.prisma.$transaction((tx) => requireStaffOperator(tx, actorUserId));
    const request = await this.prisma.assignmentRequest.findUnique({ where: { bookingId }, select: { bookingId: true } });
    if (!request) throw new NotFoundException('Assignment request not found');
    return this.process(bookingId, actorUserId);
  }

  async process(bookingId: string, actorUserId?: string): Promise<AllocationResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<AllocationResult> => {
        // Serialize allocation attempts; exclusion constraints remain the final overlap barrier.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(721033)::text`;
        await tx.$queryRaw`SELECT booking_id FROM public.booking WHERE booking_id = ${bookingId}::uuid FOR UPDATE`;
        const request = await tx.assignmentRequest.findUnique({ where: { bookingId }, include: { booking: { include: { outsourcedDetails: true } } } });
        if (!request) throw new NotFoundException('Assignment request not found');
        if (request.completedAt) {
          if (request.booking.bookingStatus === BookingStatus.CONFIRMED) {
            const legacy = await tx.bookingAssignment.findFirst({ where: { bookingId, assignmentStatus: AssignmentStatus.ASSIGNED, dispatchedAt: null }, select: { id: true, vehicleId: true, driverId: true, driver: { select: { staff: { select: { userId: true } } } } } });
            if (!legacy || request.booking.endDatetime <= new Date()) return { bookingId, status: 'PENDING', reason: 'DISPATCH_REQUIRES_REVIEW' };
            await tx.$queryRaw`SELECT vehicle_id FROM public.vehicle WHERE vehicle_id = ${legacy.vehicleId}::uuid FOR UPDATE`;
            const ready = await tx.vehicle.findFirst({ where: { ...eligiblePairsWhere(request.booking, legacy.id), id: legacy.vehicleId, assignedDriverId: legacy.driverId }, select: { id: true } });
            if (!ready) return { bookingId, status: 'PENDING', reason: 'DISPATCH_REQUIRES_REVIEW' };
            await this.dispatch(tx, legacy.id, bookingId, legacy.driver.staff.userId, request.booking.customerUserId);
          } else if (request.booking.bookingStatus !== BookingStatus.DISPATCHED && request.booking.bookingStatus !== BookingStatus.IN_PROGRESS && request.booking.bookingStatus !== BookingStatus.COMPLETED) {
            return { bookingId, status: 'PENDING', reason: 'BOOKING_STATE_CHANGED' };
          }
          return { bookingId, status: request.booking.bookingStatus === BookingStatus.COMPLETED ? 'COMPLETED' : 'ASSIGNED', reason: null };
        }
        const booking = request.booking;
        const fail = async (reason: string): Promise<AllocationResult> => {
          await tx.assignmentRequest.update({ where: { bookingId }, data: { attempts: { increment: 1 }, lastFailure: reason } });
          if (request.isRecovery && request.lastFailure !== reason) {
            const operators = await tx.userProfile.findMany({ where: {
              accountStatus: AccountStatus.ACTIVE,
              OR: [ { role: UserRole.ADMIN, OR: [{ staff: { is: null } }, { staff: { is: { driver: { is: null } } } }] },
                { role: UserRole.STAFF, staff: { is: { employmentStatus: EmploymentStatus.ACTIVE, driver: { is: null } } } } ],
            }, select: { userId: true } });
            if (operators.length) await tx.notification.createMany({ data: operators.map((operator) => ({
              recipientUserId: operator.userId, notificationType: NotificationType.BOOKING, title: 'Assignment recovery needs review',
              message: 'Automatic internal replacement could not resolve a dispatched booking.', actionUrl: '/staff/assignment-requests',
            })) });
          }
          return { bookingId, status: 'PENDING', reason };
        };
        if (booking.bookingStatus !== BookingStatus.PAID_AWAITING_ASSIGNMENT && booking.bookingStatus !== BookingStatus.RECOVERY_REQUIRED) return fail('BOOKING_STATE_CHANGED');
        const paid = await tx.payment.findFirst({ where: { bookingId, paymentStatus: PaymentStatus.PAID, currency: 'PHP', amount: booking.finalQuotedPrice }, select: { id: true } });
        if (!paid) return fail('FULL_PAYMENT_REQUIRED');
        if (booking.outsourcedDetails) return fail('OUTSOURCED_FULFILMENT_REQUIRES_REVIEW');
        if (booking.endDatetime <= new Date()) return fail('TRIP_INTERVAL_ELAPSED');

        const earlier = await tx.assignmentRequest.findFirst({
          where: { completedAt: null, booking: { is: {
            bookingStatus: { in: [BookingStatus.PAID_AWAITING_ASSIGNMENT, BookingStatus.RECOVERY_REQUIRED] },
            outsourcedDetails: { is: null },
            vehicleTypeId: booking.vehicleTypeId,
            startDatetime: { lt: booking.endDatetime }, endDatetime: { gt: booking.startDatetime },
            OR: [ { createdAt: { lt: booking.createdAt } }, { createdAt: booking.createdAt, id: { lt: booking.id } } ],
          } } }, select: { bookingId: true },
        });
        if (earlier) return fail('EARLIER_PAID_BOOKING_PENDING');
        const where = eligiblePairsWhere(booking);
        const declined = await tx.bookingAssignment.findMany({ where: { bookingId, assignmentStatus: AssignmentStatus.DECLINED }, select: { driverId: true } });
        const excludedDriverIds = declined.map((assignment) => assignment.driverId);
        if (excludedDriverIds.length) where.assignedDriverId = { notIn: excludedDriverIds };
        const candidates = await tx.vehicle.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
        for (const candidate of candidates) {
          // Lock readiness owners before the final fresh eligibility read.
          await tx.$queryRaw`
            SELECT v.vehicle_id FROM public.vehicle v
            JOIN public.driver d ON d.driver_id = v.assigned_driver_id
            JOIN public.staff s ON s.staff_id = d.staff_id
            JOIN public.user_profile u ON u.user_id = s.user_id
            WHERE v.vehicle_id = ${candidate.id}::uuid
            FOR UPDATE OF v, d, s, u`;
          const vehicle = await tx.vehicle.findFirst({ where: { ...where, id: candidate.id }, select: { id: true, assignedDriverId: true, assignedDriver: { select: { staff: { select: { userId: true } } } } } });
          if (!vehicle?.assignedDriverId) continue;
          const assignment = await tx.bookingAssignment.create({ data: {
            bookingId, vehicleId: vehicle.id, driverId: vehicle.assignedDriverId,
            assignmentStatus: AssignmentStatus.ASSIGNED,
            reservedFrom: booking.startDatetime, reservedUntil: booking.endDatetime,
            tripState: 'DISPATCHED',
          } });
          await tx.booking.update({ where: { id: bookingId }, data: { bookingStatus: BookingStatus.CONFIRMED } });
          await tx.bookingTransition.create({ data: {
            bookingId, actorUserId: actorUserId ?? (request.isRecovery ? null : request.actorUserId), actorSource: !actorUserId && request.isRecovery ? 'SYSTEM' : 'USER',
            previousState: booking.bookingStatus, nextState: BookingStatus.CONFIRMED,
            reason: 'Verified full payment allocated an eligible internal pair',
          } });
          await this.dispatch(tx, assignment.id, bookingId, vehicle.assignedDriver!.staff.userId, booking.customerUserId);
          await tx.assignmentRequest.update({ where: { bookingId }, data: { completedAt: new Date(), attempts: { increment: 1 }, lastFailure: null } });
          return { bookingId, status: 'ASSIGNED', reason: null };
        }
        return fail('NO_ELIGIBLE_PAIR');
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch {
      // A durable pending request survives database conflicts and process interruption.
      this.logger.warn('Allocation attempt requires retry; payment remains recorded');
      return { bookingId, status: 'PENDING', reason: 'RETRY_REQUIRED' };
    }
  }

  private async dispatch(tx: Prisma.TransactionClient, assignmentId: string, bookingId: string, driverUserId: string, customerUserId: string) {
    const dispatchedAt = new Date();
    await tx.bookingAssignment.update({ where: { id: assignmentId }, data: { dispatchedAt, responseDeadline: this.policy.deadline(dispatchedAt), tripState: 'DISPATCHED' } });
    await tx.driverEvent.create({ data: { assignmentId, actorSource: 'SYSTEM', action: 'DISPATCHED', reason: 'Eligible internal pair automatically dispatched' } });
    await tx.booking.update({ where: { id: bookingId }, data: { bookingStatus: BookingStatus.DISPATCHED } });
    await tx.bookingTransition.create({ data: { bookingId, actorSource: 'SYSTEM', previousState: BookingStatus.CONFIRMED, nextState: BookingStatus.DISPATCHED, reason: 'Automatic dispatch generated after assignment' } });
    await tx.notification.createMany({ data: [
      { recipientUserId: driverUserId, notificationType: NotificationType.BOOKING, title: 'New trip assignment', message: 'Review your assigned trip and respond before its deadline.', actionUrl: `/driver/assignments/${assignmentId}` },
      { recipientUserId: customerUserId, notificationType: NotificationType.BOOKING, title: 'Your transport has been assigned', message: 'Your booking has been assigned and the driver has been notified.', actionUrl: `/bookings/${bookingId}` },
    ] });
  }
}
