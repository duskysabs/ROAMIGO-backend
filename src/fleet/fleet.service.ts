import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  AccountStatus,
  AssignmentStatus,
  DriverStatus,
  EmploymentStatus,
  UserRole,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { eligiblePairsWhere } from './allocation-eligibility.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { FleetAvailabilityQueryDto } from './dto/fleet-availability-query.dto.js';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto.js';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

const ACTIVE_ASSIGNMENT_STATUSES = [
  AssignmentStatus.RESERVED,
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.ACKNOWLEDGED,
] as const;

const USER_SUMMARY_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  role: true,
  accountStatus: true,
} as const;

const VEHICLE_INCLUDE = {
  vehicleType: true,
  assignedDriver: {
    include: {
      staff: {
        include: {
          user: { select: USER_SUMMARY_SELECT },
        },
      },
    },
  },
} as const;

const DRIVER_INCLUDE = {
  staff: {
    include: {
      user: { select: USER_SUMMARY_SELECT },
    },
  },
  vehicle: {
    include: {
      vehicleType: true,
    },
  },
} as const;

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async listVehicles(query: ListVehiclesQueryDto, actorRole: UserRole) {
    if (query.includeDeleted && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can include deleted vehicles');
    }

    const search = query.search?.trim();
    const where: Prisma.VehicleWhereInput = {
      ...(query.includeDeleted ? {} : { isDeleted: false }),
      vehicleStatus: query.status,
      vehicleTypeId: query.vehicleTypeId,
      OR: search
        ? [
            { plateNumber: { contains: search, mode: 'insensitive' } },
            { vehicleModel: { contains: search, mode: 'insensitive' } },
            { color: { contains: search, mode: 'insensitive' } },
            {
              assignedDriver: {
                is: {
                  licenseNumber: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: VEHICLE_INCLUDE,
        orderBy: { plateNumber: 'asc' },
        skip,
        take: query.limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return this.paginated(data, total, query.page, query.limit);
  }

  async getVehicle(id: string, actorRole: UserRole) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id,
        ...(actorRole === UserRole.ADMIN ? {} : { isDeleted: false }),
      },
      include: VEHICLE_INCLUDE,
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async listDrivers(query: ListDriversQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.DriverWhereInput = {
      driverStatus: query.status,
      OR: search
        ? [
            { licenseNumber: { contains: search, mode: 'insensitive' } },
            {
              staff: {
                is: {
                  user: {
                    is: {
                      OR: [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: DRIVER_INCLUDE,
        orderBy: { licenseNumber: 'asc' },
        skip,
        take: query.limit,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return this.paginated(data, total, query.page, query.limit);
  }

  async getDriver(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: DRIVER_INCLUDE,
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  async createVehicle(dto: CreateVehicleDto) {
    await this.ensureVehicleType(dto.vehicleTypeId);

    try {
      return await this.prisma.vehicle.create({
        data: {
          vehicleTypeId: dto.vehicleTypeId,
          plateNumber: this.normalizeIdentifier(dto.plateNumber),
          fuelType: dto.fuelType,
          fuelEfficiency: dto.fuelEfficiency,
          vehicleModel: dto.vehicleModel.trim(),
          passengerCapacity: dto.passengerCapacity,
          yearModel: dto.yearModel,
          color: dto.color.trim(),
          vehicleStatus: VehicleStatus.UNAVAILABLE,
        },
        include: VEHICLE_INCLUDE,
      });
    } catch (error) {
      this.rethrowVehicleUniqueConflict(error);
    }
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.requireVehicle(id);
    if (vehicle.isDeleted) {
      throw new ConflictException('Deleted vehicles cannot be updated');
    }
    if (dto.vehicleTypeId) await this.ensureVehicleType(dto.vehicleTypeId);

    if (dto.vehicleTypeId !== undefined || dto.passengerCapacity !== undefined) {
      await this.ensureNoActiveVehicleAssignment(id);
    }

    try {
      return await this.prisma.vehicle.update({
        where: { id },
        data: {
          vehicleTypeId: dto.vehicleTypeId,
          plateNumber: dto.plateNumber
            ? this.normalizeIdentifier(dto.plateNumber)
            : undefined,
          fuelType: dto.fuelType,
          fuelEfficiency: dto.fuelEfficiency,
          vehicleModel: dto.vehicleModel?.trim(),
          passengerCapacity: dto.passengerCapacity,
          yearModel: dto.yearModel,
          color: dto.color?.trim(),
        },
        include: VEHICLE_INCLUDE,
      });
    } catch (error) {
      this.rethrowVehicleUniqueConflict(error);
    }
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.requireVehicle(id);
    if (vehicle.isDeleted) throw new ConflictException('Vehicle is already deleted');
    await this.ensureNoActiveVehicleAssignment(id);

    return this.prisma.$transaction(async (tx) => {
      if (vehicle.assignedDriverId) {
        await tx.driver.updateMany({
          where: {
            id: vehicle.assignedDriverId,
            driverStatus: DriverStatus.AVAILABLE,
          },
          data: { driverStatus: DriverStatus.UNAVAILABLE },
        });
      }

      return tx.vehicle.update({
        where: { id },
        data: {
          assignedDriverId: null,
          isDeleted: true,
          vehicleStatus: VehicleStatus.INACTIVE,
        },
        include: VEHICLE_INCLUDE,
      });
    });
  }

  async createDriver(dto: CreateDriverDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: dto.staffId },
      include: { user: true, driver: true },
    });
    if (!staff) throw new NotFoundException('Staff record not found');
    if (staff.driver) throw new ConflictException('Staff member is already a driver');
    this.ensureStaffEligibleForDriving(staff);

    const licenseExpiry = this.parseLicenseExpiry(dto.licenseExpiry);
    this.ensureLicenseValid(licenseExpiry);

    try {
      return await this.prisma.driver.create({
        data: {
          staffId: dto.staffId,
          licenseNumber: this.normalizeIdentifier(dto.licenseNumber),
          licenseExpiry,
          driverStatus: DriverStatus.UNAVAILABLE,
        },
        include: DRIVER_INCLUDE,
      });
    } catch (error) {
      this.rethrowDriverUniqueConflict(error);
    }
  }

  async updateDriver(id: string, dto: UpdateDriverDto) {
    await this.requireDriver(id);
    const licenseExpiry = dto.licenseExpiry
      ? this.parseLicenseExpiry(dto.licenseExpiry)
      : undefined;
    if (licenseExpiry) this.ensureLicenseValid(licenseExpiry);

    try {
      return await this.prisma.driver.update({
        where: { id },
        data: {
          licenseNumber: dto.licenseNumber
            ? this.normalizeIdentifier(dto.licenseNumber)
            : undefined,
          licenseExpiry,
        },
        include: DRIVER_INCLUDE,
      });
    } catch (error) {
      this.rethrowDriverUniqueConflict(error);
    }
  }

  async deactivateDriver(id: string) {
    const driver = await this.requireDriver(id);
    await this.ensureNoActiveDriverAssignment(id);

    return this.prisma.$transaction(async (tx) => {
      if (driver.vehicle) {
        await tx.vehicle.update({
          where: { id: driver.vehicle.id },
          data: {
            assignedDriverId: null,
            vehicleStatus: VehicleStatus.UNAVAILABLE,
          },
        });
      }

      return tx.driver.update({
        where: { id },
        data: { driverStatus: DriverStatus.INACTIVE },
        include: DRIVER_INCLUDE,
      });
    });
  }

  async updateVehicleStatus(id: string, vehicleStatus: VehicleStatus) {
    await this.ensureNoActiveVehicleAssignment(id);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        assignedDriver: {
          include: { staff: { include: { user: true } } },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.isDeleted) throw new ConflictException('Deleted vehicles cannot change status');

    if (vehicleStatus === VehicleStatus.AVAILABLE) {
      if (!vehicle.assignedDriver) {
        throw new BadRequestException('An available vehicle must have a designated driver');
      }
      this.ensureDriverEligibleForAvailability(vehicle.assignedDriver);
      if (vehicle.assignedDriver.driverStatus !== DriverStatus.AVAILABLE) {
        throw new BadRequestException('The designated driver must be available first');
      }
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: { vehicleStatus },
      include: VEHICLE_INCLUDE,
    });
  }

  async updateDriverStatus(id: string, driverStatus: DriverStatus) {
    await this.ensureNoActiveDriverAssignment(id);
    const driver = await this.requireDriver(id);

    if (driverStatus === DriverStatus.AVAILABLE) {
      this.ensureDriverEligibleForAvailability(driver);
      if (!driver.vehicle || driver.vehicle.isDeleted) {
        throw new BadRequestException('An available driver must have a designated active vehicle');
      }
    }

    return this.prisma.driver.update({
      where: { id },
      data: { driverStatus },
      include: DRIVER_INCLUDE,
    });
  }

  async designateDriver(vehicleId: string, driverId?: string | null) {
    await this.ensureNoActiveVehicleAssignment(vehicleId);
    if (driverId) await this.ensureNoActiveDriverAssignment(driverId);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { assignedDriver: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.isDeleted) throw new ConflictException('Deleted vehicles cannot be paired');

    if (!driverId) {
      await this.ensureNoActiveVehicleAssignment(vehicleId);
      if (vehicle.assignedDriverId) {
        await this.ensureNoActiveDriverAssignment(vehicle.assignedDriverId);
      }
      return this.prisma.$transaction(async (tx) => {
        if (vehicle.assignedDriverId) {
          await tx.driver.updateMany({
            where: {
              id: vehicle.assignedDriverId,
              driverStatus: DriverStatus.AVAILABLE,
            },
            data: { driverStatus: DriverStatus.UNAVAILABLE },
          });
        }
        return tx.vehicle.update({
          where: { id: vehicleId },
          data: {
            assignedDriverId: null,
            vehicleStatus:
              vehicle.vehicleStatus === VehicleStatus.AVAILABLE
                ? VehicleStatus.UNAVAILABLE
                : undefined,
          },
          include: VEHICLE_INCLUDE,
        });
      });
    }

    const driver = await this.requireDriver(driverId);
    this.ensureDriverEligibleForAvailability(driver);

    if (vehicle.assignedDriverId === driverId) {
      return this.getVehicle(vehicleId, UserRole.ADMIN);
    }
    if (vehicle.assignedDriverId) {
      throw new ConflictException('Vehicle already has a designated driver; unpair it first');
    }
    if (driver.vehicle && driver.vehicle.id !== vehicleId) {
      throw new ConflictException('Driver already has a designated vehicle; unpair it first');
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { assignedDriverId: driverId },
      include: VEHICLE_INCLUDE,
    });
  }

  async availability(query: FleetAvailabilityQueryDto) {
    const start = new Date(query.start);
    const end = new Date(query.end);
    if (end <= start) {
      throw new BadRequestException('End datetime must be after start datetime');
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: eligiblePairsWhere({ vehicleTypeId: query.vehicleTypeId, passengerCount: query.passengers, startDatetime: start, endDatetime: end }),
      include: { assignedDriver: true, vehicleType: true },
    });

    return {
      eligible: vehicles.map((vehicle) => ({
        vehicleId: vehicle.id,
        driverId: vehicle.assignedDriverId,
        vehicleTypeId: vehicle.vehicleTypeId,
        passengerCapacity: vehicle.passengerCapacity,
      })),
      exclusionReason: vehicles.length ? null : 'NO_ELIGIBLE_VEHICLE_DRIVER_PAIR',
    };
  }

  private async requireVehicle(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { assignedDriver: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private async requireDriver(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        staff: { include: { user: true } },
        vehicle: true,
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private async ensureVehicleType(id: string) {
    const vehicleType = await this.prisma.vehicleType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!vehicleType) throw new NotFoundException('Vehicle type not found');
  }

  private async ensureNoActiveVehicleAssignment(vehicleId: string) {
    const activeAssignment = await this.prisma.bookingAssignment.findFirst({
      where: {
        vehicleId,
        assignmentStatus: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
      },
      select: { id: true },
    });
    if (activeAssignment) {
      throw new ConflictException('Vehicle has an active booking assignment');
    }
  }

  private async ensureNoActiveDriverAssignment(driverId: string) {
    const activeAssignment = await this.prisma.bookingAssignment.findFirst({
      where: {
        driverId,
        assignmentStatus: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
      },
      select: { id: true },
    });
    if (activeAssignment) {
      throw new ConflictException('Driver has an active booking assignment');
    }
  }

  private ensureStaffEligibleForDriving(staff: {
    employmentStatus: EmploymentStatus;
    user: { role: UserRole; accountStatus: AccountStatus };
  }) {
    if (staff.user.role !== UserRole.STAFF && staff.user.role !== UserRole.DRIVER) {
      throw new BadRequestException('A Staff or Driver profile is required');
    }
    if (staff.employmentStatus !== EmploymentStatus.ACTIVE) {
      throw new BadRequestException('Driver Staff record must be active');
    }
    if (staff.user.accountStatus !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Driver user account must be active');
    }
  }

  private ensureDriverEligibleForAvailability(driver: {
    licenseExpiry: Date;
    staff: {
      employmentStatus: EmploymentStatus;
      user: { role: UserRole; accountStatus: AccountStatus };
    };
  }) {
    this.ensureStaffEligibleForDriving(driver.staff);
    this.ensureLicenseValid(driver.licenseExpiry);
  }

  private parseLicenseExpiry(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('License expiry must be a valid date');
    }
    return this.toUtcDate(parsed);
  }

  private ensureLicenseValid(expiry: Date) {
    if (this.toUtcDate(expiry) < this.toUtcDate(new Date())) {
      throw new BadRequestException('Driver license is expired');
    }
  }

  private toUtcDate(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private normalizeIdentifier(value: string) {
    return value.trim().toUpperCase();
  }

  private paginated<T>(data: T[], total: number, page: number, limit: number) {
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private rethrowVehicleUniqueConflict(error: unknown): never {
    if (this.isUniqueConstraintViolation(error)) {
      throw new ConflictException('Plate number already exists');
    }
    throw error;
  }

  private rethrowDriverUniqueConflict(error: unknown): never {
    if (this.isUniqueConstraintViolation(error)) {
      throw new ConflictException('Staff member or license number is already registered as a driver');
    }
    throw error;
  }

  private isUniqueConstraintViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
