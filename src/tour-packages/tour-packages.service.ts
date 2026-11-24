import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { auditMasterData, requireMasterDataAdmin } from '../common/master-data-audit.js';
import { requireStaffOperator } from '../common/staff-operator.js';
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
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, adminUserId);
      const result = await tx.tourPackage.create({
        data: {
          packageName: dto.packageName, description: dto.description, basePrice: dto.basePrice,
          estimatedDurationMinutes: dto.estimatedDurationMinutes, packageStatus: PackageStatus.INACTIVE,
          createdByAdmin: { connect: { userId: adminUserId } },
          stops: { create: dto.stops.map((stop, index) => ({ ...stop, sequenceNumber: index + 1 })) },
        }, include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      });
      await auditMasterData(tx, adminUserId, 'TOUR_PACKAGE', result.id, 'CREATE', null, result);
      return result;
    }, { timeout: 15_000 });
  }

  update(adminUserId: string, id: string, dto: UpdateTourPackageDto) {
    return this.mutate(adminUserId, id, 'UPDATE', tx => tx.tourPackage.update({
      where: { id }, data: dto, include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
    }));
  }

  replaceStops(adminUserId: string, id: string, dto: ReplaceTourPackageStopsDto) {
    this.validateStops(dto.stops);
    return this.mutate(adminUserId, id, 'REPLACE_STOPS', async tx => {
      await tx.packageStop.deleteMany({ where: { tourPackageId: id } });
      return tx.tourPackage.update({ where: { id }, data: {
        stops: { create: dto.stops.map((stop, index) => ({ ...stop, sequenceNumber: index + 1 })) },
      }, include: { stops: { orderBy: { sequenceNumber: 'asc' } } } });
    });
  }

  setStatus(adminUserId: string, id: string, packageStatus: PackageStatus) {
    return this.mutate(adminUserId, id, packageStatus === PackageStatus.ACTIVE ? 'ACTIVATE' : 'DEACTIVATE', async (tx, before) => {
      if (packageStatus === PackageStatus.ACTIVE) this.validateStops(before.stops);
      if (before.packageStatus === packageStatus) return before;
      return tx.tourPackage.update({ where: { id }, data: { packageStatus }, include: { stops: { orderBy: { sequenceNumber: 'asc' } } } });
    });
  }

  private mutate(adminUserId: string, id: string, action: string,
    write: (tx: Prisma.TransactionClient, before: Prisma.TourPackageGetPayload<{ include: { stops: true } }>) => Promise<Prisma.TourPackageGetPayload<{ include: { stops: true } }>>) {
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, adminUserId);
      await tx.$queryRaw`SELECT tour_package_id FROM public.tour_package WHERE tour_package_id = ${id}::uuid FOR UPDATE`;
      const before = await tx.tourPackage.findUnique({ where: { id }, include: { stops: { orderBy: { sequenceNumber: 'asc' } } } });
      if (!before) throw new NotFoundException('Tour package not found');
      const result = await write(tx, before);
      if (result !== before) await auditMasterData(tx, adminUserId, 'TOUR_PACKAGE', id, action, before, result);
      return result;
    }, { timeout: 15_000 });
  }

  findForStaff(actorUserId: string) {
    return this.prisma.$transaction(async tx => {
      await requireStaffOperator(tx, actorUserId);
      return tx.tourPackage.findMany({ include: { stops: { orderBy: { sequenceNumber: 'asc' } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
    });
  }

  findForCustomers() {
    return this.prisma.tourPackage.findMany({
      where: { packageStatus: PackageStatus.ACTIVE },
      include: { stops: { orderBy: { sequenceNumber: 'asc' } } },
      orderBy: { packageName: 'asc' },
    }).then((packages) => packages.map((tourPackage) => this.toCustomerPackage(tourPackage)));
  }

  async findOneForCustomers(id: string) {
    const tourPackage = await this.prisma.tourPackage.findFirst({ where: { id, packageStatus: PackageStatus.ACTIVE }, include: { stops: { orderBy: { sequenceNumber: 'asc' } } } });
    if (!tourPackage) throw new NotFoundException('Tour package not found');
    return this.toCustomerPackage(tourPackage);
  }

  private validateStops(stops: ReadonlyArray<{ stopType: StopType }>) {
    if (stops.length < 2 || stops.length > 30) throw new BadRequestException('Use 2 to 30 package stops');
    if (stops[0]?.stopType !== StopType.PICKUP || stops.at(-1)?.stopType !== StopType.DROPOFF) {
      throw new BadRequestException('A package route must begin with a pickup and end with a dropoff');
    }
    if (stops.filter((stop) => stop.stopType === StopType.PICKUP).length !== 1 || stops.filter((stop) => stop.stopType === StopType.DROPOFF).length !== 1) {
      throw new BadRequestException('A package route must contain one pickup and one dropoff');
    }
  }

  // Keep internal creator, status-management, and timestamp fields out of the
  // customer catalog contract while retaining the server-authoritative route.
  private toCustomerPackage(tourPackage: { id: string; packageName: string; description: string; basePrice: { toString(): string }; estimatedDurationMinutes: number; stops: Array<{ sequenceNumber: number; stopType: string; locationName: string; activity: string; formattedAddress: string; latitude: { toString(): string }; longitude: { toString(): string }; defaultStopMinutes: number }> }) {
    return { id: tourPackage.id, name: tourPackage.packageName, description: tourPackage.description, basePrice: tourPackage.basePrice.toString(), estimatedDurationMinutes: tourPackage.estimatedDurationMinutes, stops: tourPackage.stops.map((stop) => ({ sequenceNumber: stop.sequenceNumber, stopType: stop.stopType, locationName: stop.locationName, activity: stop.activity, formattedAddress: stop.formattedAddress, latitude: stop.latitude.toString(), longitude: stop.longitude.toString(), plannedStopMinutes: stop.defaultStopMinutes })) };
  }
}
