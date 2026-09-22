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
import { PricingQuoteGateway } from '../pricing/pricing-quote.gateway.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingQuoteGateway: PricingQuoteGateway,
  ) {}

  /** Validates, prices, and persists a customer booking with its route stops. */
  async create(customerUserId: string, dto: CreateBookingDto) {
    this.validateCreateRequest(dto);
    const packageStops = await this.validateBookingSelections(dto);
    const routeStops = packageStops ?? dto.stops!;

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
      },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
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
      return null;
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
    return tourPackage.stops.map((stop) => ({
      stopType: stop.stopType,
      locationName: stop.locationName,
      formattedAddress: stop.formattedAddress,
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
      activity: stop.activity,
      plannedStopMinutes: stop.defaultStopMinutes,
    }));
  }

  /** Returns the authenticated customer's booking history, never a global list. */
  findMine(customerUserId: string) {
    return this.prisma.booking.findMany({
      where: { customerUserId },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Retrieves a single booking only when the customer owns it. */
  async findOneMine(customerUserId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerUserId },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: true,
        payments: true,
        receivable: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }
}
