import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingCancellation } from '../generated/prisma/client.js';
import { AccountStatus, AssignmentStatus, BookingStatus, CancellationCategory, CancellationStatus, EmploymentStatus, NotificationType, PaymentStatus, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CancelUnpaidBookingDto } from './dto/cancel-unpaid-booking.dto.js';

const UNPAID_POLICY = 'unpaid-customer-v1';

@Injectable()
export class UnpaidCancellationsService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(customerUserId: string, bookingId: string, dto: CancelUnpaidBookingDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT user_id FROM public.user_profile WHERE user_id = ${customerUserId}::uuid FOR UPDATE`;
      const customer = await tx.userProfile.findUnique({ where: { userId: customerUserId }, select: {
        role: true, accountStatus: true, staff: { select: { driver: { select: { id: true } } } },
      } });
      if (!customer || customer.role !== UserRole.CUSTOMER || customer.accountStatus !== AccountStatus.ACTIVE || customer.staff?.driver) {
        throw new ForbiddenException('An active Customer profile is required');
      }
      // Payment review locks this same row before deciding or creating a handoff.
      await tx.$queryRaw`SELECT booking_id FROM public.booking WHERE booking_id = ${bookingId}::uuid AND customer_user_id = ${customerUserId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, customerUserId }, select: { id: true, bookingStatus: true } });
      if (!booking) throw new NotFoundException('Booking not found');
      const existing = await tx.bookingCancellation.findUnique({ where: { bookingId } });
      if (existing) {
        if (booking.bookingStatus === BookingStatus.CANCELLED && existing.requestedByUserId === customerUserId &&
            existing.cancellationStatus === CancellationStatus.COMPLETED && existing.cancellationCategory === CancellationCategory.CUSTOMER_REQUEST &&
            existing.reviewNotes === UNPAID_POLICY && existing.penaltyRate.isZero() && existing.penaltyAmount.isZero()) {
          return this.view(existing);
        }
        throw new ConflictException('This booking already has another cancellation workflow');
      }
      if (booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT) {
        throw new ConflictException('Only an unpaid booking awaiting payment can use this cancellation path');
      }
      const paid = await tx.payment.findFirst({ where: { bookingId, OR: [
        { paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.CONFIRMED, PaymentStatus.REFUNDED] } }, { paidAt: { not: null } },
      ] }, select: { id: true } });
      const assignment = await tx.bookingAssignment.findFirst({ where: { bookingId, assignmentStatus: AssignmentStatus.ASSIGNED }, select: { id: true } });
      const handoff = await tx.assignmentRequest.findUnique({ where: { bookingId }, select: { bookingId: true } });
      if (paid || assignment || handoff) throw new ConflictException('Payment or assignment requires a separate cancellation review');
      const now = new Date();
      const cancellation = await tx.bookingCancellation.create({ data: {
        bookingId, requestedByUserId: customerUserId, cancellationReason: dto.reason,
        cancellationCategory: CancellationCategory.CUSTOMER_REQUEST, cancellationStatus: CancellationStatus.COMPLETED,
        isLateCancellation: false, penaltyRate: '0.00', penaltyAmount: '0.00', requestedAt: now, reviewedAt: now,
        reviewNotes: UNPAID_POLICY,
      } });
      await tx.booking.update({ where: { id: bookingId }, data: { bookingStatus: BookingStatus.CANCELLED } });
      await tx.bookingTransition.create({ data: {
        bookingId, actorUserId: customerUserId, previousState: BookingStatus.AWAITING_PAYMENT,
        nextState: BookingStatus.CANCELLED, reason: `Unpaid cancellation (${UNPAID_POLICY}): ${dto.reason}`,
      } });
      const operators = await tx.userProfile.findMany({ where: {
        accountStatus: AccountStatus.ACTIVE,
        OR: [
          { role: UserRole.ADMIN, OR: [{ staff: { is: null } }, { staff: { is: { driver: { is: null } } } }] },
          { role: UserRole.STAFF, staff: { is: { employmentStatus: EmploymentStatus.ACTIVE, driver: { is: null } } } },
        ],
      }, select: { userId: true } });
      await tx.notification.createMany({ data: [
        { recipientUserId: customerUserId, notificationType: NotificationType.BOOKING,
          title: 'Unpaid booking cancelled', message: 'Your booking was cancelled with no cancellation fee. This does not record a refund.', actionUrl: `/my-bookings/${bookingId}` },
        ...operators.map(({ userId }) => ({ recipientUserId: userId, notificationType: NotificationType.BOOKING,
          title: 'Customer cancelled an unpaid booking', message: 'Review any pending receipt evidence separately. No refund was recorded.', actionUrl: '/accounting/payments' })),
      ] });
      return this.view(cancellation);
    }, { timeout: 15_000 });
  }

  private view(cancellation: BookingCancellation) {
    return {
      id: cancellation.id, bookingId: cancellation.bookingId, bookingStatus: BookingStatus.CANCELLED,
      cancellationStatus: cancellation.cancellationStatus, cancellationCategory: cancellation.cancellationCategory,
      reason: cancellation.cancellationReason, policyVersion: UNPAID_POLICY,
      penaltyRate: cancellation.penaltyRate.toFixed(2), penaltyAmount: cancellation.penaltyAmount.toFixed(2),
      requestedAt: cancellation.requestedAt, completedAt: cancellation.reviewedAt,
    };
  }
}
