import {
  BadRequestException,
  ConflictException,
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
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto.js';

const ACTIVE_ASSIGNMENT_STATUSES = [
  AssignmentStatus.RESERVED,
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.ACKNOWLEDGED,
] as const;

const STAFF_INCLUDE = {
  user: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      birthDate: true,
      homeAddress: true,
      role: true,
      accountStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  driver: {
    include: {
      vehicle: {
        include: { vehicleType: true },
      },
    },
  },
} as const;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        profile: { select: { userId: true } },
      },
    });
    if (!authUser) {
      throw new NotFoundException('Supabase Auth user not found');
    }
    if (authUser.profile) {
      throw new ConflictException('User already has an application profile');
    }

    try {
      const profile = await this.prisma.userProfile.create({
        data: {
          userId: dto.userId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          homeAddress: dto.homeAddress,
          role: UserRole.STAFF,
          accountStatus: AccountStatus.ACTIVE,
          staff: {
            create: { employmentStatus: EmploymentStatus.ACTIVE },
          },
        },
        include: { staff: { include: STAFF_INCLUDE } },
      });

      return profile.staff;
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('User already has an application profile');
      }
      if (this.isPrismaError(error, 'P2003')) {
        throw new NotFoundException('Supabase Auth user not found');
      }
      throw error;
    }
  }

  async list(query: ListStaffQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.StaffWhereInput = {
      employmentStatus: query.employmentStatus,
      user: {
        is: {
          accountStatus: query.accountStatus,
          OR: search
            ? [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phoneNumber: { contains: search, mode: 'insensitive' } },
              ]
            : undefined,
        },
      },
      ...(query.hasDriver === true ? { driver: { isNot: null } } : {}),
      ...(query.hasDriver === false ? { driver: { is: null } } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.staff.findMany({
        where,
        include: STAFF_INCLUDE,
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
        skip,
        take: query.limit,
      }),
      this.prisma.staff.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async detail(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException('Staff record not found');
    return staff;
  }

  async updateProfile(staffId: string, dto: UpdateStaffProfileDto) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('At least one profile field is required');
    }
    await this.requireStaff(staffId);

    return this.prisma.staff.update({
      where: { id: staffId },
      data: {
        user: {
          update: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
            birthDate:
              dto.birthDate === undefined
                ? undefined
                : dto.birthDate === null
                  ? null
                  : new Date(dto.birthDate),
            homeAddress: dto.homeAddress,
          },
        },
      },
      include: STAFF_INCLUDE,
    });
  }

  async updateEmploymentStatus(
    staffId: string,
    employmentStatus: EmploymentStatus,
  ) {
    const staff = await this.requireStaff(staffId);
    if (staff.employmentStatus === employmentStatus) return staff;

    if (employmentStatus !== EmploymentStatus.ACTIVE && staff.driver) {
      const activeAssignment = await this.prisma.bookingAssignment.findFirst({
        where: {
          driverId: staff.driver.id,
          assignmentStatus: { in: [...ACTIVE_ASSIGNMENT_STATUSES] },
        },
        select: { id: true },
      });
      if (activeAssignment) {
        throw new ConflictException(
          'Staff Driver has an active booking assignment',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const accountStatus =
        employmentStatus === EmploymentStatus.ACTIVE
          ? AccountStatus.ACTIVE
          : AccountStatus.INACTIVE;

      await tx.userProfile.update({
        where: { userId: staff.userId },
        data: { accountStatus },
      });

      if (employmentStatus !== EmploymentStatus.ACTIVE && staff.driver) {
        if (staff.driver.vehicle) {
          await tx.vehicle.update({
            where: { id: staff.driver.vehicle.id },
            data: {
              assignedDriverId: null,
              vehicleStatus: VehicleStatus.UNAVAILABLE,
            },
          });
        }

        await tx.driver.update({
          where: { id: staff.driver.id },
          data: { driverStatus: DriverStatus.INACTIVE },
        });
      }

      return tx.staff.update({
        where: { id: staffId },
        data: { employmentStatus },
        include: STAFF_INCLUDE,
      });
    });
  }

  private async requireStaff(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException('Staff record not found');
    return staff;
  }

  private isPrismaError(error: unknown, code: string) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
