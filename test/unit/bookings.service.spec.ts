import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { BookingsService } from '../../src/bookings/bookings.service.js';
import { PricingQuoteGateway } from '../../src/pricing/pricing-quote.gateway.js';
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
          },
        },
        {
          provide: PricingQuoteGateway,
          useValue: { quote },
        },
      ],
    }).compile();

    bookingsService = module.get(BookingsService);
  });

  it('returns only bookings owned by the authenticated customer', async () => {
    const bookings = [{ id: 'booking-id', customerUserId: 'customer-id' }];
    findMany.mockResolvedValue(bookings);

    await expect(bookingsService.findMine('customer-id')).resolves.toEqual(
      bookings,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { customerUserId: 'customer-id' },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns a booking only when it belongs to the authenticated customer', async () => {
    const booking = { id: 'booking-id', customerUserId: 'customer-id' };
    findFirst.mockResolvedValue(booking);

    await expect(
      bookingsService.findOneMine('customer-id', 'booking-id'),
    ).resolves.toEqual(booking);

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'booking-id', customerUserId: 'customer-id' },
      include: {
        tourPackage: true,
        vehicleType: true,
        stops: { orderBy: { sequenceNumber: 'asc' } },
        assignments: true,
        payments: true,
        receivable: true,
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

  it('prices and creates a valid custom-trip booking with ordered stops', async () => {
    findVehicleType.mockResolvedValue({ id: 'vehicle-type-id' });
    findCapacityMatch.mockResolvedValue({ id: 'vehicle-id' });
    quote.mockResolvedValue({
      totalDistanceKm: '25.50',
      estimatedDurationMinutes: 90,
      finalQuotedPrice: '1500.00',
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
