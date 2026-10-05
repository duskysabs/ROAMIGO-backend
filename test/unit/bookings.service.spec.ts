import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { PricingQuoteGateway } from '../../src/pricing/pricing-quote.gateway.js';
import { RoutingService } from '../../src/routing/routing.service.js';
import {
  AssignmentStatus,
  BookingStatus,
  BookingType,
  DriverStatus,
  EmploymentStatus,
  PackageStatus,
  StopType,
  VehicleStatus,
} from '../../src/generated/prisma/enums.js';

describe('BookingsService', () => {
  let bookingsService: BookingsService;
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const quote = vi.fn();
  const findVehicleType = vi.fn();
  const findCapacityMatch = vi.fn();
  const findTourPackage = vi.fn();
  const createBookingQuote = vi.fn();
  const previewRoute = vi.fn();
  const bookingRead = {
    id: 'booking-id', bookingType: BookingType.CUSTOM_TRIP, bookingStatus: BookingStatus.AWAITING_PAYMENT,
    startDatetime: new Date('2026-10-08T08:00:00Z'), endDatetime: new Date('2026-10-08T10:00:00Z'), passengerCount: 2,
    totalDistanceKm: '0.00', estimatedDurationMinutes: 120, finalQuotedPrice: '1200.00', createdAt: new Date('2026-10-01T00:00:00Z'),
    tourPackage: null, vehicleType: { id: 'vehicle-type-id', vehicleType: 'VAN' }, stops: [], assignments: [], payments: [], cancellation: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: {
            booking: { findMany, findFirst, create },
            vehicleType: { findUnique: findVehicleType },
            vehicle: { findFirst: findCapacityMatch },
            tourPackage: { findUnique: findTourPackage },
            bookingQuote: { create: createBookingQuote },
          },
        },
        {
          provide: PricingQuoteGateway,
          useValue: { quote },
        },
        { provide: RoutingService, useValue: { preview: previewRoute } },
      ],
    }).compile();

    bookingsService = module.get(BookingsService);
  });

  it('returns only bookings owned by the authenticated customer', async () => {
    const bookings = [bookingRead];
    findMany.mockResolvedValue(bookings);

    await expect(bookingsService.findMine('customer-id')).resolves.toEqual(
      { items: [expect.objectContaining({ id: 'booking-id', paymentStates: [] })], nextCursor: null },
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { customerUserId: 'customer-id' },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: { select: { assignmentStatus: true } },
        payments: { include: { refunds: { select: { refundStatus: true } } } },
        cancellation: { select: { cancellationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 21,
    });
  });

  it('returns a booking only when it belongs to the authenticated customer', async () => {
    const booking = bookingRead;
    findFirst.mockResolvedValue(booking);

    await expect(
      bookingsService.findOneMine('customer-id', 'booking-id'),
    ).resolves.toEqual(expect.objectContaining({ id: 'booking-id', assignmentStates: [] }));

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'booking-id', customerUserId: 'customer-id' },
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
  });

  it('does not reveal a booking that is not owned by the customer', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      bookingsService.findOneMine('customer-id', 'another-booking-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['an invalid schedule', { startDatetime: '2026-10-01T10:00:00.000Z', endDatetime: '2026-10-01T09:00:00.000Z' }],
    ['a route without a pickup first', { stops: [{ stopType: StopType.INTERMEDIATE }, { stopType: StopType.DROPOFF }] }],
    ['a custom trip with a package', { tourPackageId: '00000000-0000-4000-8000-000000000001' }],
  ])('rejects %s before pricing or persistence', async (_label, override) => {
    const dto = {
      vehicleTypeId: '00000000-0000-4000-8000-000000000002',
      bookingType: BookingType.CUSTOM_TRIP,
      startDatetime: '2026-10-01T09:00:00.000Z',
      endDatetime: '2026-10-01T10:00:00.000Z',
      passengerCount: 2,
      stops: [
        { stopType: StopType.PICKUP, latitude: 14.6, longitude: 120.9 },
        { stopType: StopType.DROPOFF, latitude: 14.7, longitude: 121.0 },
      ],
      ...override,
    } as never;

    await expect(bookingsService.create('customer-id', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an unknown vehicle type before pricing or persistence', async () => {
    findVehicleType.mockResolvedValue(null);
    const dto = {
      vehicleTypeId: '00000000-0000-4000-8000-000000000002',
      bookingType: BookingType.CUSTOM_TRIP,
      startDatetime: '2026-10-01T09:00:00.000Z',
      endDatetime: '2026-10-01T10:00:00.000Z',
      passengerCount: 2,
      stops: [
        { stopType: StopType.PICKUP, latitude: 14.6, longitude: 120.9 },
        { stopType: StopType.DROPOFF, latitude: 14.7, longitude: 121.0 },
      ],
    } as never;

    await expect(bookingsService.create('customer-id', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(quote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('issues a Custom Trip quote from server-resolved route evidence', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue({ id: 'vehicle-id' });
    previewRoute.mockResolvedValue({
      provider: 'geoapify',
      totalDistanceKm: '12.35',
      estimatedDurationMinutes: 62,
      geometry: { type: 'MultiLineString', coordinates: [] },
      stops: [
        { placeId: 'pickup-place', formattedAddress: 'Pickup address', latitude: 10.1, longitude: 123.1 },
        { placeId: 'dropoff-place', formattedAddress: 'Dropoff address', latitude: 10.2, longitude: 123.2 },
      ],
    });
    quote.mockResolvedValue({
      totalDistanceKm: '12.35',
      estimatedDurationMinutes: 62,
      finalQuotedPrice: '1200.00',
      pricingConfigurationId: 'pricing-config-id',
      baseRateUsed: '1200.00',
      adjustmentPercentage: '0.00',
      modelVersion: 'admin-fixed-v1',
    });
    createBookingQuote.mockResolvedValue({ id: 'quote-id' });

    await expect(bookingsService.issueQuote('customer-id', {
      vehicleTypeId: '00000000-0000-4000-8000-000000000002',
      bookingType: BookingType.CUSTOM_TRIP,
      startDatetime: '2026-10-01T09:00:00.000Z',
      endDatetime: '2026-10-01T10:30:00.000Z',
      passengerCount: 2,
      routePlaceIds: ['pickup-place', 'dropoff-place'],
    } as never)).resolves.toEqual(expect.objectContaining({
      quoteId: 'quote-id',
      totalDistanceKm: '12.35',
      estimatedDurationMinutes: 62,
    }));

    expect(previewRoute).toHaveBeenCalledWith({
      placeIds: ['pickup-place', 'dropoff-place'],
    });
    expect(quote).toHaveBeenCalledWith(expect.objectContaining({
      routeDistanceKm: '12.35',
      routeDurationMinutes: 62,
      stops: [
        { stopType: StopType.PICKUP, latitude: 10.1, longitude: 123.1 },
        { stopType: StopType.DROPOFF, latitude: 10.2, longitude: 123.2 },
      ],
    }));
    expect(createBookingQuote).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        routeEvidence: expect.objectContaining({ provider: 'geoapify', totalDistanceKm: '12.35' }),
        requestSnapshot: expect.objectContaining({
          stops: [
            expect.objectContaining({ stopType: StopType.PICKUP, formattedAddress: 'Pickup address' }),
            expect.objectContaining({ stopType: StopType.DROPOFF, formattedAddress: 'Dropoff address' }),
          ],
        }),
      }),
    }));
  });

  it('prices and creates a valid custom-trip booking with ordered stops', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue({ id: 'vehicle-id' });
    quote.mockResolvedValue({
      totalDistanceKm: '25.50',
      estimatedDurationMinutes: 90,
      finalQuotedPrice: '1500.00',
      pricingConfigurationId: 'pricing-config-id',
      baseRateUsed: '1500.00',
      adjustmentPercentage: '0.00',
      modelVersion: 'admin-fixed-v1',
    });
    create.mockResolvedValue({ id: 'booking-id' });

    const dto = {
      vehicleTypeId: '00000000-0000-4000-8000-000000000002',
      bookingType: BookingType.CUSTOM_TRIP,
      startDatetime: '2026-10-01T09:00:00.000Z',
      endDatetime: '2026-10-01T10:30:00.000Z',
      passengerCount: 2,
      stops: [
        {
          stopType: StopType.PICKUP,
          locationName: 'Pickup',
          formattedAddress: 'Pickup address',
          latitude: 14.6,
          longitude: 120.9,
        },
        {
          stopType: StopType.DROPOFF,
          locationName: 'Dropoff',
          formattedAddress: 'Dropoff address',
          latitude: 14.7,
          longitude: 121.0,
        },
      ],
    } as never;

    await expect(bookingsService.create('customer-id', dto)).resolves.toEqual({
      id: 'booking-id',
    });
    expect(quote).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingStatus: BookingStatus.AWAITING_PAYMENT,
        }),
      }),
    );
  });

  it('uses the approved Tour Package route instead of customer-supplied stops', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue({ id: 'vehicle-id' });
    findTourPackage.mockResolvedValue({
      id: 'package-id',
      packageStatus: PackageStatus.ACTIVE,
      basePrice: '1200.00',
      estimatedDurationMinutes: 90,
      stops: [
        {
          sequenceNumber: 1,
          stopType: StopType.PICKUP,
          locationName: 'Package pickup',
          formattedAddress: 'Approved pickup',
          latitude: 14.61,
          longitude: 120.91,
          activity: 'Meet-up',
          defaultStopMinutes: 10,
        },
        {
          sequenceNumber: 2,
          stopType: StopType.DROPOFF,
          locationName: 'Package dropoff',
          formattedAddress: 'Approved dropoff',
          latitude: 14.71,
          longitude: 121.01,
          activity: 'Tour end',
          defaultStopMinutes: 15,
        },
      ],
    });
    quote.mockResolvedValue({
      totalDistanceKm: '25.50',
      estimatedDurationMinutes: 90,
      finalQuotedPrice: '1500.00',
      pricingConfigurationId: 'pricing-config-id',
      baseRateUsed: '300.00',
      adjustmentPercentage: '0.00',
      modelVersion: 'admin-fixed-v1',
    });
    create.mockResolvedValue({ id: 'booking-id' });

    await bookingsService.create('customer-id', {
      vehicleTypeId: '00000000-0000-4000-8000-000000000002',
      bookingType: BookingType.TOUR_PACKAGE,
      tourPackageId: '00000000-0000-4000-8000-000000000003',
      startDatetime: '2026-10-01T09:00:00.000Z',
      endDatetime: '2026-10-01T10:30:00.000Z',
      passengerCount: 2,
      stops: [],
    } as never);

    expect(findTourPackage).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000003' },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
    expect(quote).toHaveBeenCalledWith(
      expect.objectContaining({
        stops: [
          { stopType: StopType.PICKUP, latitude: 14.61, longitude: 120.91 },
          { stopType: StopType.DROPOFF, latitude: 14.71, longitude: 121.01 },
        ],
      }),
    );
  });

  it('rejects an inactive Tour Package before pricing or persistence', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue({ id: 'vehicle-id' });
    findTourPackage.mockResolvedValue({
      packageStatus: PackageStatus.INACTIVE,
      stops: [],
    });

    await expect(
      bookingsService.create('customer-id', {
        vehicleTypeId: '00000000-0000-4000-8000-000000000002',
        bookingType: BookingType.TOUR_PACKAGE,
        tourPackageId: '00000000-0000-4000-8000-000000000003',
        startDatetime: '2026-10-01T09:00:00.000Z',
        endDatetime: '2026-10-01T10:30:00.000Z',
        passengerCount: 2,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a request when no eligible vehicle-driver pair is available', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue(null);

    await expect(
      bookingsService.create('customer-id', {
        vehicleTypeId: '00000000-0000-4000-8000-000000000002',
        bookingType: BookingType.CUSTOM_TRIP,
        startDatetime: '2026-10-01T09:00:00.000Z',
        endDatetime: '2026-10-01T10:30:00.000Z',
        passengerCount: 20,
        stops: [
          { stopType: StopType.PICKUP, latitude: 14.6, longitude: 120.9 },
          { stopType: StopType.DROPOFF, latitude: 14.7, longitude: 121.0 },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findCapacityMatch).toHaveBeenCalledWith({
      where: {
        vehicleTypeId: '00000000-0000-4000-8000-000000000002',
        passengerCapacity: { gte: 20 },
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
                startDatetime: { lt: new Date('2026-10-01T10:30:00.000Z') },
                endDatetime: { gt: new Date('2026-10-01T09:00:00.000Z') },
              },
            },
          },
        },
      },
    });
    expect(quote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
