import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, DriverStatus, EmploymentStatus, VehicleStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FleetAvailabilityQueryDto } from './dto/fleet-availability-query.dto.js';

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  listVehicles() { return this.prisma.vehicle.findMany({ where: { isDeleted: false }, include: { vehicleType: true, assignedDriver: { include: { staff: true } } }, orderBy: { plateNumber: 'asc' } }); }
  listDrivers() { return this.prisma.driver.findMany({ include: { staff: true, vehicle: true }, orderBy: { licenseNumber: 'asc' } }); }

  async updateVehicleStatus(id: string, vehicleStatus: VehicleStatus) {
    await this.ensureVehicle(id);
    return this.prisma.vehicle.update({ where: { id }, data: { vehicleStatus } });
  }

  async updateDriverStatus(id: string, driverStatus: DriverStatus) {
    const driver = await this.prisma.driver.findUnique({ where: { id }, include: { staff: true } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.staff.employmentStatus !== EmploymentStatus.ACTIVE && driverStatus === DriverStatus.AVAILABLE) throw new BadRequestException('Only an active Staff member can become an available driver');
    return this.prisma.driver.update({ where: { id }, data: { driverStatus } });
  }

  async designateDriver(vehicleId: string, driverId?: string | null) {
    await this.ensureVehicle(vehicleId);
    if (driverId) {
      const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
      if (!driver) throw new NotFoundException('Driver not found');
    }
    // The schema enforces one designated vehicle per Driver. Explicitly
    // disconnect a former vehicle before assigning the requested pairing.
    return this.prisma.$transaction(async (tx) => {
      if (driverId) await tx.vehicle.updateMany({ where: { assignedDriverId: driverId, id: { not: vehicleId } }, data: { assignedDriverId: null } });
      return tx.vehicle.update({ where: { id: vehicleId }, data: { assignedDriverId: driverId ?? null }, include: { assignedDriver: true } });
    });
  }

  async availability(query: FleetAvailabilityQueryDto) {
    const start = new Date(query.start); const end = new Date(query.end);
    if (end <= start) throw new BadRequestException('End datetime must be after start datetime');
    const vehicles = await this.prisma.vehicle.findMany({ where: { vehicleTypeId: query.vehicleTypeId, passengerCapacity: { gte: query.passengers }, isDeleted: false, vehicleStatus: VehicleStatus.AVAILABLE, assignedDriver: { is: { driverStatus: DriverStatus.AVAILABLE, staff: { is: { employmentStatus: EmploymentStatus.ACTIVE } } } }, assignments: { none: { assignmentStatus: { in: [AssignmentStatus.RESERVED, AssignmentStatus.ASSIGNED, AssignmentStatus.ACKNOWLEDGED] }, booking: { is: { startDatetime: { lt: end }, endDatetime: { gt: start } } } } } }, include: { assignedDriver: true, vehicleType: true } });
    return { eligible: vehicles.map((vehicle) => ({ vehicleId: vehicle.id, driverId: vehicle.assignedDriverId, vehicleTypeId: vehicle.vehicleTypeId, passengerCapacity: vehicle.passengerCapacity })), exclusionReason: vehicles.length ? null : 'NO_ELIGIBLE_VEHICLE_DRIVER_PAIR' };
  }

  private async ensureVehicle(id: string) { if (!await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Vehicle not found'); }
}
