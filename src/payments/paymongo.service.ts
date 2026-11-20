import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { BookingStatus, PaymentChannel, PaymentMethod, PaymentStatus, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { createTestCheckout, getVerifiedTestPayment, PaymongoRejectedRequest, testSecretKey } from './paymongo-client.js';
import { validTestSignature } from './paymongo-signature.js';

type Event = { data?: { id?: unknown; attributes?: { type?: unknown; livemode?: unknown; data?: { id?: unknown } } } };

@Injectable()
export class PaymongoService {
  constructor(private readonly prisma: PrismaService, private readonly assignments: AssignmentsService) {}

  async createCheckout(customerUserId: string, bookingId: string) {
    testSecretKey();
    const successUrl = this.configuredUrl('PAYMONGO_TEST_SUCCESS_URL');
    const cancelUrl = this.configuredUrl('PAYMONGO_TEST_CANCEL_URL');
    const reserved = await this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, bookingId);
      const booking = await tx.booking.findFirst({ where: { id: bookingId, customerUserId }, select: {
        id: true, bookingStatus: true, finalQuotedPrice: true,
      } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT) throw new ConflictException('Booking is not awaiting payment');
      const existing = await tx.paymongoCheckout.findUnique({ where: { bookingId } });
      if (existing?.sessionId && existing.checkoutUrl) {
        return { existing: { sessionId: existing.sessionId, checkoutUrl: existing.checkoutUrl }, booking: null };
      }
      if (existing) throw new ConflictException('PayMongo checkout is being prepared; contact support if this persists');
      if (!booking.finalQuotedPrice.greaterThan(0)) throw new BadRequestException('Booking quote must be positive');
      await tx.paymongoCheckout.create({ data: { bookingId } });
      return { existing: null, booking };
    });
    if (reserved.existing) return reserved.existing;
    const amountCentavos = reserved.booking!.finalQuotedPrice.times(100).toNumber();
    if (!Number.isSafeInteger(amountCentavos)) throw new BadRequestException('Booking quote cannot be charged');
    let session: { sessionId: string; checkoutUrl: string };
    try {
      session = await createTestCheckout({ bookingId, amountCentavos, successUrl, cancelUrl });
    } catch (error) {
      // A definitive client error did not create a session; network errors and
      // ambiguous provider responses keep the reservation for manual recovery.
      if (error instanceof PaymongoRejectedRequest) {
        await this.prisma.paymongoCheckout.deleteMany({ where: { bookingId, sessionId: null } });
      }
      throw error;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, bookingId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (booking.bookingStatus !== BookingStatus.AWAITING_PAYMENT || !booking.finalQuotedPrice.equals(reserved.booking!.finalQuotedPrice)) {
        throw new ConflictException('Booking changed while checkout was being prepared; contact support');
      }
      await tx.payment.create({ data: {
        bookingId, paymentChannel: PaymentChannel.ONLINE, paymentMethod: PaymentMethod.OTHER,
        provider: 'paymongo:test', providerReference: session.sessionId,
        amount: booking.finalQuotedPrice, currency: 'PHP', paymentStatus: PaymentStatus.PENDING,
        audits: { create: { actorUserId: customerUserId, actorRole: UserRole.CUSTOMER,
          action: 'RECORDED', nextState: PaymentStatus.PENDING, reason: 'PayMongo test checkout created' } },
      } });
      await tx.paymongoCheckout.update({ where: { bookingId }, data: session });
    });
    return session;
  }

  async acceptWebhook(header: string | undefined, rawBody: Buffer | undefined) {
    const secret = process.env.PAYMONGO_TEST_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('PayMongo test webhook is not configured');
    if (!rawBody || rawBody.length > 256 * 1024 || !validTestSignature(header, rawBody, secret)) {
      throw new UnauthorizedException('Invalid PayMongo webhook signature');
    }
    let event: Event;
    try { event = JSON.parse(rawBody.toString('utf8')) as Event; }
    catch { throw new BadRequestException('Invalid PayMongo webhook JSON'); }
    const attributes = event?.data?.attributes;
    if (attributes?.livemode !== false) throw new UnauthorizedException('Live PayMongo events are disabled');
    if (attributes.type !== 'checkout_session.payment.paid') return { received: true, ignored: true };
    const eventId = event.data?.id;
    const sessionId = attributes.data?.id;
    if (typeof eventId !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(eventId) || typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9]+$/.test(sessionId)) {
      throw new BadRequestException('Invalid PayMongo checkout event');
    }
    if (await this.prisma.paymongoWebhookEvent.findUnique({ where: { eventId }, select: { eventId: true } })) {
      return { received: true, duplicate: true };
    }
    const confirmed = await getVerifiedTestPayment(sessionId);
    const bookingId = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.paymongoCheckout.findUnique({ where: { sessionId } });
      if (!checkout) throw new ServiceUnavailableException('PayMongo checkout is not yet recorded');
      await this.lockBooking(tx, checkout.bookingId);
      if (await tx.paymongoWebhookEvent.findUnique({ where: { eventId }, select: { eventId: true } })) return null;
      const payment = await tx.payment.findUnique({ where: { provider_providerReference: {
        provider: 'paymongo:test', providerReference: sessionId,
      } }, include: { booking: true } });
      if (!payment || payment.bookingId !== checkout.bookingId) throw new ServiceUnavailableException('PayMongo payment is not yet recorded');
      if (confirmed.currency !== 'PHP' || confirmed.amountCentavos !== payment.amount.times(100).toNumber() || !payment.amount.equals(payment.booking.finalQuotedPrice)) {
        throw new ConflictException('PayMongo paid amount does not match the booking quote');
      }
      await tx.paymongoWebhookEvent.create({ data: { eventId, sessionId } });
      if (payment.paymentStatus === PaymentStatus.PAID) return null;
      if (payment.paymentStatus !== PaymentStatus.PENDING) throw new ConflictException('PayMongo payment needs manual review');
      const assign = payment.booking.bookingStatus === BookingStatus.AWAITING_PAYMENT;
      await tx.payment.update({ where: { id: payment.id }, data: {
        paymentStatus: PaymentStatus.PAID, paidAt: new Date(),
        audits: { create: { actorUserId: payment.booking.customerUserId, actorRole: UserRole.CUSTOMER,
          action: 'DECIDED', previousState: PaymentStatus.PENDING, nextState: PaymentStatus.PAID,
          reason: assign ? 'PayMongo test payment independently verified' : 'PayMongo test payment received after booking state changed; staff review needed' } },
      } });
      if (!assign) return null;
      await tx.booking.update({ where: { id: checkout.bookingId }, data: { bookingStatus: BookingStatus.PAID_AWAITING_ASSIGNMENT } });
      await tx.bookingTransition.create({ data: {
        bookingId: checkout.bookingId, actorSource: 'SYSTEM', previousState: BookingStatus.AWAITING_PAYMENT,
        nextState: BookingStatus.PAID_AWAITING_ASSIGNMENT, reason: 'Full PayMongo test payment verified; assignment pending',
      } });
      await tx.assignmentRequest.create({ data: { bookingId: checkout.bookingId, actorUserId: payment.booking.customerUserId } });
      return checkout.bookingId;
    });
    if (bookingId) await this.assignments.process(bookingId);
    return { received: true };
  }

  private configuredUrl(name: string): string {
    const value = process.env[name];
    try {
      const url = new URL(value ?? '');
      if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.toString();
    } catch { /* missing or malformed configuration */ }
    throw new ServiceUnavailableException(`${name} is not configured with a valid URL`);
  }

  private async lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
    await tx.$queryRaw`SELECT booking_id FROM public.booking WHERE booking_id = ${bookingId}::uuid FOR UPDATE`;
  }
}
