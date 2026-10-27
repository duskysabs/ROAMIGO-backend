import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  AccountStatus,
  BookingStatus,
  NotificationType,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BookingReviewDecision,
  BookingReviewDecisionDto,
} from './dto/booking-review-decision.dto.js';
import { RecordOutsourcedDetailsDto } from './dto/record-outsourced-details.dto.js';

@Injectable()
export class BookingReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending() {
    return this.prisma.booking.findMany({
      where: { bookingStatus: BookingStatus.BOOKING_REVIEW },
      select: {
        id: true,
        bookingType: true,
        startDatetime: true,
        endDatetime: true,
        passengerCount: true,
        finalQuotedPrice: true,
        createdAt: true,
        customer: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        vehicleType: { select: { id: true, vehicleType: true } },
        outsourcedDetails: {
          select: {
            id: true,
            vehicleProvider: true,
            vehicleModel: true,
            plateNumber: true,
            driverName: true,
            driverContact: true,
            agreedCost: true,
            recordedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findPending(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, bookingStatus: BookingStatus.BOOKING_REVIEW },
      include: {
        customer: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        vehicleType: true,
        tourPackage: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        outsourcedDetails: true,
        transitions: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!booking) throw new NotFoundException('Booking review not found');
    return booking;
  }

  async recordOutsourcedDetails(
    actorUserId: string,
    bookingId: string,
    dto: RecordOutsourcedDetailsDto,
  ) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (!staff) {
      throw new ForbiddenException(
        'A staff profile is required to record outsourced resources',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          customerUserId: true,
          vehicleTypeId: true,
          bookingStatus: true,
        },
      });
      if (!booking) throw new NotFoundException('Booking review not found');
      if (booking.bookingStatus !== BookingStatus.BOOKING_REVIEW) {
        throw new BadRequestException('Booking is not awaiting staff review');
      }

      const recordedAt = new Date();
      const details = await tx.outsourcedDetails.upsert({
        where: { bookingId },
        create: {
          bookingId,
          vehicleTypeId: booking.vehicleTypeId,
          vehicleModel: dto.vehicleModel.trim(),
          plateNumber: dto.plateNumber.trim().toUpperCase(),
          vehicleProvider: dto.vehicleProvider.trim(),
          driverName: dto.driverName.trim(),
          driverContact: dto.driverContact.trim(),
          agreedCost: dto.agreedCost,
          recordedByStaffId: staff.id,
          recordedAt,
        },
        update: {
          vehicleTypeId: booking.vehicleTypeId,
          vehicleModel: dto.vehicleModel.trim(),
          plateNumber: dto.plateNumber.trim().toUpperCase(),
          vehicleProvider: dto.vehicleProvider.trim(),
          driverName: dto.driverName.trim(),
          driverContact: dto.driverContact.trim(),
          agreedCost: dto.agreedCost,
          recordedByStaffId: staff.id,
          recordedAt,
        },
      });

      await tx.notification.create({
        data: {
          recipientUserId: booking.customerUserId,
          notificationType: NotificationType.BOOKING,
          title: 'Outsourced transport is ready for review',
          message:
            'Staff recorded an outsourced vehicle and driver for your booking. Review the details and approve or reject the offer.',
          actionUrl: `/bookings/${booking.id}`,
        },
      });

      return details;
    });
  }

  async rejectByStaff(actorUserId: string, bookingId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, customerUserId: true, bookingStatus: true },
      });
      if (!booking) throw new NotFoundException('Booking review not found');
      if (booking.bookingStatus !== BookingStatus.BOOKING_REVIEW) {
        throw new BadRequestException('Booking is not awaiting staff review');
      }

      const changed = await tx.booking.updateMany({
        where: { id: bookingId, bookingStatus: BookingStatus.BOOKING_REVIEW },
        data: { bookingStatus: BookingStatus.REJECTED },
      });
      if (changed.count !== 1) {
        throw new BadRequestException('Booking review was already resolved');
      }

      await tx.bookingTransition.create({
        data: {
          bookingId,
          actorUserId,
          previousState: BookingStatus.BOOKING_REVIEW,
          nextState: BookingStatus.REJECTED,
          reason: reason.trim(),
        },
      });
      await tx.notification.create({
        data: {
          recipientUserId: booking.customerUserId,
          notificationType: NotificationType.BOOKING,
          title: 'Booking review could not be fulfilled',
          message: reason.trim(),
          actionUrl: `/bookings/${bookingId}`,
        },
      });

      return { bookingId, bookingStatus: BookingStatus.REJECTED };
    });
  }

  async decide(
    customerUserId: string,
    bookingId: string,
    dto: BookingReviewDecisionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, customerUserId },
        select: {
          id: true,
          bookingStatus: true,
          outsourcedDetails: { select: { id: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking review not found');
      if (booking.bookingStatus !== BookingStatus.BOOKING_REVIEW) {
        throw new BadRequestException('Booking review was already resolved');
      }
      if (
        dto.decision === BookingReviewDecision.APPROVE &&
        !booking.outsourcedDetails
      ) {
        throw new BadRequestException(
          'Outsourced vehicle and driver details have not been submitted',
        );
      }

      const nextState =
        dto.decision === BookingReviewDecision.APPROVE
          ? BookingStatus.AWAITING_PAYMENT
          : BookingStatus.CANCELLED;
      const changed = await tx.booking.updateMany({
        where: { id: bookingId, bookingStatus: BookingStatus.BOOKING_REVIEW },
        data: { bookingStatus: nextState },
      });
      if (changed.count !== 1) {
        throw new BadRequestException('Booking review was already resolved');
      }

      await tx.bookingTransition.create({
        data: {
          bookingId,
          actorUserId: customerUserId,
          previousState: BookingStatus.BOOKING_REVIEW,
          nextState,
          reason:
            dto.decision === BookingReviewDecision.APPROVE
              ? 'Customer approved the outsourced vehicle and driver'
              : 'Customer rejected the outsourced vehicle and driver',
        },
      });
      await this.notifyStaff(
        tx,
        bookingId,
        dto.decision === BookingReviewDecision.APPROVE
          ? 'Customer approved outsourced transport'
          : 'Customer rejected outsourced transport',
        dto.decision === BookingReviewDecision.APPROVE
          ? `Booking ${bookingId} is now awaiting payment.`
          : `Booking ${bookingId} was cancelled by the customer.`,
      );

      return { bookingId, bookingStatus: nextState };
    });
  }

  private async notifyStaff(
    tx: Prisma.TransactionClient,
    bookingId: string,
    title: string,
    message: string,
  ) {
    const recipients = await tx.userProfile.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.STAFF] },
        accountStatus: AccountStatus.ACTIVE,
      },
      select: { userId: true },
    });
    if (!recipients.length) return;
    await tx.notification.createMany({
      data: recipients.map(({ userId }) => ({
        recipientUserId: userId,
        notificationType: NotificationType.BOOKING,
        title,
        message,
        actionUrl: `/staff/booking-reviews/${bookingId}`,
      })),
    });
  }
}
