import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AssignmentStatus,
  BookingStatus,
  BookingType,
  DriverStatus,
  EmploymentStatus,
  PackageStatus,
  StopType,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PricingQuoteGateway } from '../pricing/pricing-quote.gateway.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListMyBookingsDto } from './dto/list-my-bookings.dto.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingQuoteGateway: PricingQuoteGateway,
  ) {}

  /** Validates, prices, and persists a customer booking with its route stops. */
  async create(customerUserId: string, dto: CreateBookingDto) {
    this.validateCreateRequest(dto);
    const selection = await this.validateBookingSelections(dto);
    const routeStops = selection.stops ?? dto.stops!;

    // Customer input never supplies price, distance, or duration. Those values
    // must come from the backend-controlled pricing integration.
    const quote = await this.pricingQuoteGateway.quote({
      bookingType: dto.bookingType,
      vehicleTypeId: dto.vehicleTypeId,
      startDatetime: new Date(dto.startDatetime),
      endDatetime: new Date(dto.endDatetime),
      passengerCount: dto.passengerCount,
      stops: routeStops.map((stop) => ({
        stopType: stop.stopType,
        latitude: stop.latitude,
        longitude: stop.longitude,
      })),
      tourPackageBasePrice: selection.tourPackageBasePrice,
      tourPackageDurationMinutes: selection.tourPackageDurationMinutes,
    });

    // Nested creation keeps the booking and its ordered stops atomic.
    return this.prisma.booking.create({
      data: {
        customerUserId,
        vehicleTypeId: dto.vehicleTypeId,
        bookingType: dto.bookingType,
        tourPackageId: dto.tourPackageId,
        startDatetime: new Date(dto.startDatetime),
        endDatetime: new Date(dto.endDatetime),
        passengerCount: dto.passengerCount,
        // A quote is not proof of payment. Payment confirmation is deliberately
        // owned by a future PayMongo/manual-payment workflow before the booking
        // can transition to CONFIRMED and receive a final assignment.
        bookingStatus: BookingStatus.AWAITING_PAYMENT,
        totalDistanceKm: quote.totalDistanceKm,
        estimatedDurationMinutes: quote.estimatedDurationMinutes,
        finalQuotedPrice: quote.finalQuotedPrice,
        notes: dto.notes,
        stops: {
          create: routeStops.map((stop, index) => ({
            sequenceNumber: index + 1,
            stopType: stop.stopType,
            locationName: stop.locationName,
            formattedAddress: stop.formattedAddress,
            latitude: stop.latitude,
            longitude: stop.longitude,
            activity: stop.activity,
            plannedStopMinutes: stop.plannedStopMinutes,
          })),
        },
        // Keep the configuration snapshot with the accepted booking. Future
        // Admin price changes must not rewrite historical quote evidence.
        pricingCalculations: {
          create: {
            pricingConfigId: quote.pricingConfigurationId,
            baseRateUsed: quote.baseRateUsed,
            distanceKm: quote.totalDistanceKm,
            tripDurationMinutes: quote.estimatedDurationMinutes,
            bookingDemandCount: 0,
            vehicleAvailability: 0,
            driverAvailability: 0,
            suggestedAmount: quote.finalQuotedPrice,
            adjustmentPercentage: quote.adjustmentPercentage,
            modelVersion: quote.modelVersion,
          },
        },
      },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
  }

  async previewQuote(dto: CreateBookingDto) {
    this.validateCreateRequest(dto);
    const selection = await this.validateBookingSelections(dto);
    const routeStops = selection.stops ?? dto.stops!;
    const quote = await this.pricingQuoteGateway.quote({ bookingType: dto.bookingType, vehicleTypeId: dto.vehicleTypeId, startDatetime: new Date(dto.startDatetime), endDatetime: new Date(dto.endDatetime), passengerCount: dto.passengerCount, stops: routeStops.map((stop) => ({ stopType: stop.stopType, latitude: stop.latitude, longitude: stop.longitude })), tourPackageBasePrice: selection.tourPackageBasePrice, tourPackageDurationMinutes: selection.tourPackageDurationMinutes });
    // Quote preview does not reserve capacity. #14 adds a signed, expiring quote
    // context for tamper-resistant booking submission.
    return { currency: 'PHP', totalDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: quote.estimatedDurationMinutes, finalQuotedPrice: quote.finalQuotedPrice, pricingMode: quote.modelVersion };
  }

  async issueQuote(customerUserId: string, dto: CreateBookingDto) {
    this.validateCreateRequest(dto);
    const selection = await this.validateBookingSelections(dto);
    const routeStops = selection.stops ?? dto.stops!;
    const quote = await this.pricingQuoteGateway.quote({ bookingType: dto.bookingType, vehicleTypeId: dto.vehicleTypeId, startDatetime: new Date(dto.startDatetime), endDatetime: new Date(dto.endDatetime), passengerCount: dto.passengerCount, stops: routeStops.map((stop) => ({ stopType: stop.stopType, latitude: stop.latitude, longitude: stop.longitude })), tourPackageBasePrice: selection.tourPackageBasePrice, tourPackageDurationMinutes: selection.tourPackageDurationMinutes });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    // DTO instances are not Prisma JSON values. Serialize only the validated
    // request snapshot so it is stable across class-transformer boundaries.
    const requestSnapshot = JSON.parse(JSON.stringify({ ...dto, stops: routeStops })) as Prisma.InputJsonObject;
    const stored = await this.prisma.bookingQuote.create({ data: { customerUserId, bookingType: dto.bookingType, vehicleTypeId: dto.vehicleTypeId, tourPackageId: dto.tourPackageId, requestSnapshot, pricingConfigId: quote.pricingConfigurationId, totalDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: quote.estimatedDurationMinutes, finalQuotedPrice: quote.finalQuotedPrice, expiresAt } });
    return { quoteId: stored.id, currency: 'PHP', totalDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: quote.estimatedDurationMinutes, finalQuotedPrice: quote.finalQuotedPrice, expiresAt, pricingMode: quote.modelVersion };
  }

  async submitQuote(customerUserId: string, command: { quoteId: string; idempotencyKey: string }) {
    const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
    if (existing) return existing;
    const quote = await this.prisma.bookingQuote.findFirst({ where: { id: command.quoteId, customerUserId, consumedAt: null, expiresAt: { gt: new Date() } }, include: { pricingConfiguration: true } });
    if (!quote) throw new BadRequestException('Quote is expired, consumed, or unavailable');
    const snapshot = quote.requestSnapshot as unknown as CreateBookingDto;
    // Recheck availability immediately before durable consumption. The stored
    // quote price remains immutable even when configuration changes later.
    this.validateCreateRequest(snapshot);
    await this.validateBookingSelections(snapshot);
    const stops = snapshot.stops ?? [];
    return this.prisma.$transaction(async (tx) => {
      const retry = await tx.booking.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
      if (retry) return retry;
      // Claim before writing the booking so only one request can consume a quote.
      // A failed transaction rolls this claim back with the booking write.
      const claimed = await tx.bookingQuote.updateMany({
        where: { id: quote.id, customerUserId, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Quote is expired, consumed, or unavailable');
      const booking = await tx.booking.create({ data: { customerUserId, idempotencyKey: command.idempotencyKey, vehicleTypeId: snapshot.vehicleTypeId, bookingType: snapshot.bookingType, tourPackageId: snapshot.tourPackageId, startDatetime: new Date(snapshot.startDatetime), endDatetime: new Date(snapshot.endDatetime), passengerCount: snapshot.passengerCount, bookingStatus: BookingStatus.AWAITING_PAYMENT, totalDistanceKm: quote.totalDistanceKm, estimatedDurationMinutes: quote.estimatedDurationMinutes, finalQuotedPrice: quote.finalQuotedPrice, notes: snapshot.notes, stops: { create: stops.map((stop: any, index) => ({ sequenceNumber: index + 1, stopType: stop.stopType, locationName: stop.locationName, formattedAddress: stop.formattedAddress, latitude: stop.latitude, longitude: stop.longitude, activity: stop.activity, plannedStopMinutes: stop.plannedStopMinutes })) }, pricingCalculations: { create: { pricingConfigId: quote.pricingConfigId, baseRateUsed: quote.pricingConfiguration.baseRate, distanceKm: quote.totalDistanceKm, tripDurationMinutes: quote.estimatedDurationMinutes, bookingDemandCount: 0, vehicleAvailability: 0, driverAvailability: 0, suggestedAmount: quote.finalQuotedPrice, adjustmentPercentage: 0, modelVersion: 'admin-fixed-v1' } } } });
      await tx.bookingQuote.update({ where: { id: quote.id }, data: { bookingId: booking.id } });
      await tx.bookingTransition.create({ data: { bookingId: booking.id, actorUserId: customerUserId, previousState: BookingStatus.DRAFT, nextState: BookingStatus.AWAITING_PAYMENT, reason: 'Customer accepted server-issued quote' } });
      return booking;
    });
  }

  private validateCreateRequest(dto: CreateBookingDto) {
    const startDatetime = new Date(dto.startDatetime);
    const endDatetime = new Date(dto.endDatetime);

    if (endDatetime <= startDatetime) {
      throw new BadRequestException('End datetime must be after start datetime');
    }

    if (
      (dto.bookingType === BookingType.TOUR_PACKAGE && !dto.tourPackageId) ||
      (dto.bookingType === BookingType.CUSTOM_TRIP && dto.tourPackageId)
    ) {
      throw new BadRequestException(
        'Booking type and tour package selection do not match',
      );
    }

    if (dto.bookingType === BookingType.TOUR_PACKAGE) {
      return;
    }

    const stops = dto.stops ?? [];
    if (stops[0]?.stopType !== StopType.PICKUP || stops.at(-1)?.stopType !== StopType.DROPOFF) {
      throw new BadRequestException(
        'The route must begin with a pickup and end with a dropoff',
      );
    }

    if (
      stops.filter((stop) => stop.stopType === StopType.PICKUP).length !== 1 ||
      stops.filter((stop) => stop.stopType === StopType.DROPOFF).length !== 1
    ) {
      throw new BadRequestException(
        'The route must contain one pickup and one dropoff',
      );
    }
  }

  private async validateBookingSelections(dto: CreateBookingDto) {
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id: dto.vehicleTypeId },
    });

    if (!vehicleType) {
      throw new BadRequestException('Selected vehicle type was not found');
    }

    // This pre-payment check proves that a suitable currently unassigned pair
    // exists. It does not reserve that pair: the confirmed-payment workflow
    // must repeat the check transactionally before creating an assignment.
    const eligibleVehicle = await this.prisma.vehicle.findFirst({
      where: {
        vehicleTypeId: dto.vehicleTypeId,
        passengerCapacity: { gte: dto.passengerCount },
        isDeleted: false,
        vehicleStatus: VehicleStatus.AVAILABLE,
        assignedDriver: {
          is: {
            driverStatus: DriverStatus.AVAILABLE,
            staff: { is: { employmentStatus: EmploymentStatus.ACTIVE } },
          },
        },
        assignments: {
          none: {
            assignmentStatus: {
              in: [
                AssignmentStatus.RESERVED,
                AssignmentStatus.ASSIGNED,
                AssignmentStatus.ACKNOWLEDGED,
              ],
            },
            booking: {
              is: {
                startDatetime: { lt: new Date(dto.endDatetime) },
                endDatetime: { gt: new Date(dto.startDatetime) },
              },
            },
          },
        },
      },
    });

    if (!eligibleVehicle) {
      throw new BadRequestException(
        'No available vehicle-driver pair can accommodate the requested schedule',
      );
    }

    if (!dto.tourPackageId) {
      return {};
    }

    // Only staff-approved, active packages may enter the pricing workflow.
    const tourPackage = await this.prisma.tourPackage.findUnique({
      where: { id: dto.tourPackageId },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });

    if (!tourPackage || tourPackage.packageStatus !== PackageStatus.ACTIVE) {
      throw new BadRequestException('Selected tour package is not available');
    }

    if (tourPackage.stops.length < 2) {
      throw new BadRequestException('Selected tour package has no complete route');
    }

    // Snapshot approved package stops so future package edits cannot rewrite history.
    return {
      stops: tourPackage.stops.map((stop) => ({
        stopType: stop.stopType,
        locationName: stop.locationName,
        formattedAddress: stop.formattedAddress,
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        activity: stop.activity,
        plannedStopMinutes: stop.defaultStopMinutes,
      })),
      tourPackageBasePrice: tourPackage.basePrice.toString(),
      tourPackageDurationMinutes: tourPackage.estimatedDurationMinutes,
    };
  }

  /** Returns an explicit customer-safe booking page, never a global list. */
  async findMine(customerUserId: string, query?: ListMyBookingsDto) {
    const limit = query?.limit ?? 20;
    const bookings = await this.prisma.booking.findMany({
      where: {
        customerUserId,
        ...(query?.status ? { bookingStatus: query.status } : {}),
      },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: { select: { assignmentStatus: true } },
        payments: { include: { refunds: { select: { refundStatus: true } } } },
        cancellation: { select: { cancellationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query?.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = bookings.slice(0, limit);
    return { items: items.map((booking) => this.toCustomerBooking(booking)), nextCursor: bookings.length > limit ? items.at(-1)?.id ?? null : null };
  }

  /** Retrieves a single booking only when the customer owns it. */
  async findOneMine(customerUserId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerUserId },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: { select: { assignmentStatus: true } },
        payments: { include: { refunds: { select: { refundStatus: true } } } },
        receivable: true,
        cancellation: { select: { cancellationStatus: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.toCustomerBooking(booking);
  }

  // Booking, payment, assignment, cancellation, and refund state are distinct
  // fields in the customer contract. Do not collapse them into bookingStatus.
  private toCustomerBooking(booking: any) {
    return { id: booking.id, bookingType: booking.bookingType, bookingStatus: booking.bookingStatus, startDatetime: booking.startDatetime, endDatetime: booking.endDatetime, passengerCount: booking.passengerCount, totalDistanceKm: booking.totalDistanceKm.toString(), estimatedDurationMinutes: booking.estimatedDurationMinutes, finalQuotedPrice: booking.finalQuotedPrice.toString(), createdAt: booking.createdAt, tourPackage: booking.tourPackage ? { id: booking.tourPackage.id, name: booking.tourPackage.packageName } : null, vehicleType: { id: booking.vehicleType.id, name: booking.vehicleType.vehicleType }, stops: booking.stops.map((stop: any) => ({ sequenceNumber: stop.sequenceNumber, stopType: stop.stopType, locationName: stop.locationName, formattedAddress: stop.formattedAddress, latitude: stop.latitude.toString(), longitude: stop.longitude.toString() })), paymentStates: booking.payments.map((payment: any) => payment.paymentStatus), assignmentStates: booking.assignments.map((assignment: any) => assignment.assignmentStatus), cancellationState: booking.cancellation?.cancellationStatus ?? null, refundStates: booking.payments.flatMap((payment: any) => payment.refunds.map((refund: any) => refund.refundStatus)) };
  }
}
