import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { BookingStatus, PaymentChannel, PaymentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { RecordManualPaymentDto, ReviewManualPaymentDto } from './dto/manual-payment.dto.js';
import { requireStaffOperator } from '../common/staff-operator.js';

const paymentView = {
  id: true, bookingId: true, paymentChannel: true, paymentMethod: true,
  amount: true, currency: true, paymentStatus: true, createdAt: true, paidAt: true,
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly assignments: AssignmentsService) {}

  async record(actorUserId: string, bookingId: string, dto: RecordManualPaymentDto) {
    const provider = `manual:${dto.method}`;
    const reference = dto.reference.trim().toUpperCase();
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.greaterThan(0)) throw new BadRequestException('Payment amount must be positive');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await requireStaffOperator(tx, actorUserId);
        await this.lockBooking(tx, bookingId);
        const existing = await tx.payment.findUnique({
          where: { provider_providerReference: { provider, providerReference: reference } },
          select: paymentView,
        });
        if (existing) return this.matchRecord(existing, bookingId, amount);

        const booking = await tx.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT) {
          throw new ConflictException('Booking is not awaiting payment');
        }
        if (!amount.equals(booking.finalQuotedPrice)) {
          throw new BadRequestException('The exact full quoted amount is required in PHP');
        }
        return tx.payment.create({
          data: {
            bookingId, recordedByStaffId: actor.staff?.id,
            paymentChannel: PaymentChannel.MANUAL, paymentMethod: dto.method,
            provider, providerReference: reference, amount, currency: 'PHP',
            paymentStatus: PaymentStatus.PENDING,
            audits: { create: {
              actorUserId, actorRole: actor.role, action: 'RECORDED', nextState: PaymentStatus.PENDING, reason: dto.reason,
            } },
          }, select: paymentView,
        });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = await this.prisma.payment.findUnique({
          where: { provider_providerReference: { provider, providerReference: reference } }, select: paymentView,
        });
        if (existing) return this.matchRecord(existing, bookingId, amount);
      }
      throw error;
    }
  }

  async listMine(customerUserId: string, bookingId: string, query: CursorPageQueryDto = new CursorPageQueryDto()) {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, customerUserId }, select: { id: true } });
    if (!booking) throw new NotFoundException('Booking not found');
    const rows = await this.prisma.payment.findMany({
      where: { bookingId }, select: paymentView, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.id ?? null : null };
  }

  async pending(actorUserId: string, query: CursorPageQueryDto) {
    return this.prisma.$transaction(async (tx) => {
      await requireStaffOperator(tx, actorUserId);
      const rows = await tx.payment.findMany({
        where: { paymentChannel: PaymentChannel.MANUAL, paymentStatus: PaymentStatus.PENDING },
        select: { ...paymentView, providerReference: true, audits: { select: { action: true, actorUserId: true, reason: true, occurredAt: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, query.limit);
      return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.id ?? null : null };
    });
  }

  async review(actorUserId: string, paymentId: string, approve: boolean, dto: ReviewManualPaymentDto) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const actor = await requireStaffOperator(tx, actorUserId);
      const initial = await tx.payment.findUnique({ where: { id: paymentId }, select: { bookingId: true } });
      if (!initial) throw new NotFoundException('Manual payment not found');
      await this.lockBooking(tx, initial.bookingId);
      const current = await tx.payment.findUnique({ where: { id: paymentId }, include: { booking: true } });
      if (!current || current.paymentChannel !== PaymentChannel.MANUAL) throw new NotFoundException('Manual payment not found');
      const next = approve ? PaymentStatus.PAID : PaymentStatus.FAILED;
      if (current.paymentStatus === next) return tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: paymentView });
      if (current.paymentStatus !== PaymentStatus.PENDING) throw new ConflictException('Payment review was already resolved');
      if (approve) {
        if (current.booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT) throw new ConflictException('Booking is not awaiting payment');
        if (current.currency !== 'PHP' || !current.amount.greaterThan(0) || !current.amount.equals(current.booking.finalQuotedPrice)) {
          throw new ConflictException('Only exact full PHP payment can be approved');
        }
      }
      const result = await tx.payment.update({
        where: { id: paymentId },
        data: {
          paymentStatus: next,
          ...(approve ? { paidAt: new Date() } : { failedAt: new Date() }),
          audits: { create: {
            actorUserId, actorRole: actor.role, action: 'DECIDED', previousState: PaymentStatus.PENDING, nextState: next, reason: dto.reason,
          } },
        }, select: paymentView,
      });
      if (approve) {
        await tx.booking.update({ where: { id: current.bookingId }, data: { bookingStatus: BookingStatus.PAID_AWAITING_ASSIGNMENT } });
        await tx.bookingTransition.create({ data: {
          bookingId: current.bookingId, actorUserId, previousState: BookingStatus.AWAITING_PAYMENT,
          nextState: BookingStatus.PAID_AWAITING_ASSIGNMENT, reason: 'Full manual payment verified; assignment pending',
        } });
        await tx.assignmentRequest.create({ data: { bookingId: current.bookingId, actorUserId } });
      }
      return result;
    });
    // The request is durable before allocation starts; allocation failure cannot erase received funds.
    const assignment = approve ? await this.assignments.process(payment.bookingId, actorUserId) : null;
    return { payment, assignment };
  }

  private async lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
    await tx.$queryRaw`SELECT booking_id FROM public.booking WHERE booking_id = ${bookingId}::uuid FOR UPDATE`;
  }

  private matchRecord<T extends { bookingId: string; amount: Prisma.Decimal }>(existing: T, bookingId: string, amount: Prisma.Decimal) {
    if (existing.bookingId !== bookingId || !existing.amount.equals(amount)) {
      throw new ConflictException('Payment reference is already recorded with different details');
    }
    return existing;
  }
}
