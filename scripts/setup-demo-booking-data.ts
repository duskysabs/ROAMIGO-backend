import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  AccountStatus,
  DriverStatus,
  EmploymentStatus,
  FuelType,
  PackageStatus,
  StopType,
  UserRole,
  VehicleStatus,
  VehicleTypeName,
} from '../src/generated/prisma/enums.js';
import { GeoapifyClient } from '../src/geoapify/geoapify.client.js';

// This command is intentionally limited to synthetic, non-production booking
// demo records. It does not create Supabase Auth users or expose an HTTP path.
const requiredEnvironment = [
  'DEMO_ADMIN_USER_ID',
  'DEMO_CUSTOMER_USER_ID',
  'DEMO_DRIVER_USER_ID',
  'DEMO_DRIVER_FIRST_NAME',
  'DEMO_DRIVER_LAST_NAME',
  'DEMO_DRIVER_LICENSE_NUMBER',
  'DEMO_VEHICLE_PLATE_NUMBER',
  'DEMO_CUSTOM_TRIP_PLACE_IDS',
] as const;

const DEMO_PACKAGE_NAME = 'DEMO Booking Flow Package';
const DEMO_PACKAGE_BASE_PRICE = 2500;
const DEMO_VEHICLE_RATE = 1200;

function readRequiredEnvironment(name: (typeof requiredEnvironment)[number]) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertSafeEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo booking setup cannot run in production');
  }
  if (process.env.ALLOW_DEMO_BOOKING_SETUP !== 'true') {
    throw new Error('ALLOW_DEMO_BOOKING_SETUP must be set to true');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (process.env.GEOAPIFY_ENABLED !== 'true' || !process.env.GEOAPIFY_API_KEY?.trim()) {
    throw new Error('GEOAPIFY_ENABLED=true and GEOAPIFY_API_KEY are required for the route-backed demo');
  }
}

function readDemoPlaceIds(value: string) {
  const placeIds = value.split(',').map((placeId) => placeId.trim()).filter(Boolean);
  if (placeIds.length < 2) {
    throw new Error('DEMO_CUSTOM_TRIP_PLACE_IDS must contain at least two comma-separated Geoapify place IDs');
  }
  return placeIds;
}

async function setupDemoBookingData() {
  assertSafeEnvironment();
  const [
    adminUserId,
    customerUserId,
    driverUserId,
    driverFirstName,
    driverLastName,
    driverLicenseNumber,
    vehiclePlateNumber,
    customTripPlaceIds,
  ] = requiredEnvironment.map(readRequiredEnvironment);
  const demoPlaceIds = readDemoPlaceIds(customTripPlaceIds);
  // Resolve and route the synthetic itinerary before changing demo data. This
  // prevents a setup run from reporting a usable Custom Trip when Geoapify is
  // unavailable or the configured place IDs are stale.
  const geoapify = new GeoapifyClient();
  const resolvedDemoStops = await Promise.all(demoPlaceIds.map((placeId) => geoapify.placeDetails(placeId)));
  const demoRoute = await geoapify.route(resolvedDemoStops);
  const routeDistanceKm = (demoRoute.distanceMeters / 1000).toFixed(2);
  const routeDurationMinutes = Math.ceil(demoRoute.durationSeconds / 60);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const admin = await prisma.userProfile.findUnique({
      where: { userId: adminUserId },
      include: { staff: true },
    });
    if (
      !admin ||
      admin.role !== UserRole.ADMIN ||
      admin.accountStatus !== AccountStatus.ACTIVE ||
      !admin.staff ||
      admin.staff.employmentStatus !== EmploymentStatus.ACTIVE
    ) {
      throw new Error('DEMO_ADMIN_USER_ID must reference an active Administrator with an active Staff record');
    }

    const customer = await prisma.userProfile.findUnique({
      where: { userId: customerUserId },
      include: { customer: true },
    });
    if (
      !customer ||
      customer.role !== UserRole.CUSTOMER ||
      customer.accountStatus !== AccountStatus.ACTIVE ||
      !customer.customer
    ) {
      throw new Error('DEMO_CUSTOMER_USER_ID must reference an active Customer profile completed through the approved flow');
    }

    const driverAuthUser = await prisma.authUser.findUnique({
      where: { id: driverUserId },
      select: { id: true },
    });
    if (!driverAuthUser) {
      throw new Error('DEMO_DRIVER_USER_ID must reference an existing Supabase Auth user');
    }

    const existingDriverProfile = await prisma.userProfile.findUnique({
      where: { userId: driverUserId },
      include: { staff: true },
    });
    if (existingDriverProfile && existingDriverProfile.role !== UserRole.STAFF) {
      throw new Error('DEMO_DRIVER_USER_ID already belongs to a non-Staff application profile');
    }

    const driverProfile = existingDriverProfile ?? await prisma.userProfile.create({
      data: {
        userId: driverUserId,
        firstName: driverFirstName,
        lastName: driverLastName,
        role: UserRole.STAFF,
        accountStatus: AccountStatus.ACTIVE,
        staff: { create: { employmentStatus: EmploymentStatus.ACTIVE } },
      },
      include: { staff: true },
    });
    const driverStaff = driverProfile.staff ?? await prisma.staff.create({
      data: { userId: driverUserId, employmentStatus: EmploymentStatus.ACTIVE },
    });

    const driver = await prisma.driver.upsert({
      where: { staffId: driverStaff.id },
      create: {
        staffId: driverStaff.id,
        licenseNumber: driverLicenseNumber,
        licenseExpiry: new Date('2030-12-31T00:00:00.000Z'),
        driverStatus: DriverStatus.AVAILABLE,
      },
      update: {
        licenseNumber: driverLicenseNumber,
        licenseExpiry: new Date('2030-12-31T00:00:00.000Z'),
        driverStatus: DriverStatus.AVAILABLE,
      },
    });

    const vehicleType = await prisma.vehicleType.upsert({
      where: { vehicleType: VehicleTypeName.VAN },
      create: { vehicleType: VehicleTypeName.VAN },
      update: {},
    });
    const vehicle = await prisma.vehicle.upsert({
      where: { plateNumber: vehiclePlateNumber },
      create: {
        assignedDriverId: driver.id,
        vehicleTypeId: vehicleType.id,
        plateNumber: vehiclePlateNumber,
        fuelType: FuelType.DIESEL,
        fuelEfficiency: 10,
        vehicleModel: 'DEMO Booking Van',
        passengerCapacity: 8,
        yearModel: 2024,
        color: 'White',
        vehicleStatus: VehicleStatus.AVAILABLE,
      },
      update: {
        assignedDriverId: driver.id,
        vehicleTypeId: vehicleType.id,
        fuelEfficiency: 10,
        vehicleModel: 'DEMO Booking Van',
        passengerCapacity: 8,
        yearModel: 2024,
        color: 'White',
        vehicleStatus: VehicleStatus.AVAILABLE,
        isDeleted: false,
      },
    });

    const tourPackage = await prisma.$transaction(async (tx) => {
      const existing = await tx.tourPackage.findFirst({
        where: { packageName: DEMO_PACKAGE_NAME, createdByAdminId: admin.staff!.id },
        select: { id: true },
      });
      const stops = [
        { sequenceNumber: 1, stopType: StopType.PICKUP, locationName: 'DEMO Pickup', activity: 'Meet customer', formattedAddress: 'DEMO pickup address', latitude: 10.3157, longitude: 123.8854, defaultStopMinutes: 10 },
        { sequenceNumber: 2, stopType: StopType.INTERMEDIATE, locationName: 'DEMO Stop', activity: 'Demo itinerary stop', formattedAddress: 'DEMO intermediate address', latitude: 10.305, longitude: 123.89, defaultStopMinutes: 30 },
        { sequenceNumber: 3, stopType: StopType.DROPOFF, locationName: 'DEMO Dropoff', activity: 'End trip', formattedAddress: 'DEMO dropoff address', latitude: 10.325, longitude: 123.9, defaultStopMinutes: 10 },
      ];
      if (existing) {
        await tx.packageStop.deleteMany({ where: { tourPackageId: existing.id } });
        return tx.tourPackage.update({
          where: { id: existing.id },
          data: {
            description: 'Synthetic package for the non-production booking demonstration.',
            basePrice: DEMO_PACKAGE_BASE_PRICE,
            estimatedDurationMinutes: 180,
            packageStatus: PackageStatus.ACTIVE,
            stops: { create: stops },
          },
        });
      }
      return tx.tourPackage.create({
        data: {
          packageName: DEMO_PACKAGE_NAME,
          description: 'Synthetic package for the non-production booking demonstration.',
          basePrice: DEMO_PACKAGE_BASE_PRICE,
          estimatedDurationMinutes: 180,
          packageStatus: PackageStatus.ACTIVE,
          createdByAdminId: admin.staff!.id,
          stops: { create: stops },
        },
      });
    });

    const matchingConfiguration = await prisma.pricingConfiguration.findFirst({
      where: {
        vehicleTypeId: vehicleType.id,
        updatedByAdminId: adminUserId,
        baseRate: DEMO_VEHICLE_RATE,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const otherActiveConfigurationCount = await prisma.pricingConfiguration.count({
      where: {
        vehicleTypeId: vehicleType.id,
        isActive: true,
        ...(matchingConfiguration ? { id: { not: matchingConfiguration.id } } : {}),
      },
    });
    if (otherActiveConfigurationCount) {
      throw new Error('Deactivate conflicting active VAN pricing configurations before running the demo setup');
    }
    const pricingConfiguration = matchingConfiguration
      ? await prisma.pricingConfiguration.update({
        where: { id: matchingConfiguration.id },
        data: {
          minAdjustmentPct: 0,
          maxAdjustmentPct: 0,
          isActive: true,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveUntil: null,
        },
      })
      : await prisma.pricingConfiguration.create({
        data: {
          vehicleTypeId: vehicleType.id,
          baseRate: DEMO_VEHICLE_RATE,
          minAdjustmentPct: 0,
          maxAdjustmentPct: 0,
          isActive: true,
          updatedByAdminId: adminUserId,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

    console.log(JSON.stringify({
      customerUserId,
      vehicleTypeId: vehicleType.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      tourPackageId: tourPackage.id,
      pricingConfigurationId: pricingConfiguration.id,
      expectedCustomTripPricePhp: DEMO_VEHICLE_RATE.toFixed(2),
      expectedTourPackagePricePhp: (DEMO_PACKAGE_BASE_PRICE + DEMO_VEHICLE_RATE).toFixed(2),
      customTrip: {
        placeIds: demoPlaceIds,
        resolvedStops: resolvedDemoStops.map((stop) => ({
          formattedAddress: stop.formattedAddress,
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
        provider: 'geoapify',
        routeDistanceKm,
        routeDurationMinutes,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

setupDemoBookingData().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Demo booking setup failed: ${message}`);
  process.exitCode = 1;
});
