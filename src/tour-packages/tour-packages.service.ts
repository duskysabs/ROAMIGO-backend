import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PackageStatus, StopType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTourPackageDto } from './dto/create-tour-package.dto.js';
import { ReplaceTourPackageStopsDto } from './dto/replace-tour-package-stops.dto.js';
import { UpdateTourPackageDto } from './dto/update-tour-package.dto.js';

@Injectable()
export class TourPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  // Package stops are always written from ordered input and never mutate a
  // booking snapshot. Bookings copy their route at submission time.
  create(adminUserId: string, dto: CreateTourPackageDto) {
    this.validateStops(dto.stops);
    return this.prisma.tourPackage.create({
      data: {
        packageName: dto.packageName,
        description: dto.description,
        basePrice: dto.basePrice,
        estimatedDurationMinutes: dto.estimatedDurationMinutes,
        packageStatus: PackageStatus.INACTIVE,
        createdByAdmin: { connect: { userId: adminUserId } },
        stops: { create: dto.stops.map((stop, index) => ({ ...stop, sequenceNumber: index + 1 })) },
      },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdateTourPackageDto) {
    await this.ensureExists(id);
    return this.prisma.tourPackage.update({
      where: { id },
      data: dto,
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
  }

  async replaceStops(id: string, dto: ReplaceTourPackageStopsDto) {
    this.validateStops(dto.stops);
    await this.ensureExists(id);
    // delete-and-recreate runs in one transaction, so callers never observe a
    // partially reordered route.
    return this.prisma.$transaction(async (tx) => {
      await tx.packageStop.deleteMany({ where: { tourPackageId: id } });
      return tx.tourPackage.update({
        where: { id },
        data: {
          stops: { create: dto.stops.map((stop, index) => ({ ...stop, sequenceNumber: index + 1 })) },
        },
        include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
    });
  }

  async setStatus(id: string, packageStatus: PackageStatus) {
    await this.ensureExists(id);
    return this.prisma.tourPackage.update({
      where: { id },
      data: { packageStatus },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    });
  }

  findForStaff() {
    return this.prisma.tourPackage.findMany({
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findForCustomers() {
    return this.prisma.tourPackage.findMany({
      where: { packageStatus: PackageStatus.ACTIVE },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { packageName: 'asc' },
    });
  }

  private async ensureExists(id: string) {
    const tourPackage = await this.prisma.tourPackage.findUnique({ where: { id }, select: { id: true } });
    if (!tourPackage) throw new NotFoundException('Tour package not found');
  }

  private validateStops(stops: ReplaceTourPackageStopsDto['stops']) {
    if (stops[0]?.stopType !== StopType.PICKUP || stops.at(-1)?.stopType !== StopType.DROPOFF) {
      throw new BadRequestException('A package route must begin with a pickup and end with a dropoff');
    }
    if (stops.filter((stop) => stop.stopType === StopType.PICKUP).length !== 1 || stops.filter((stop) => stop.stopType === StopType.DROPOFF).length !== 1) {
      throw new BadRequestException('A package route must contain one pickup and one dropoff');
    }
  }
}
