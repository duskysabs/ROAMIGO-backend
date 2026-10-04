import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BookingOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  // This explicit projection is the customer contract. Do not return vehicle
  // records, Driver details, or operational status through booking options.
  async vehicleTypes() {
    const vehicleTypes = await this.prisma.vehicleType.findMany({
      where: { vehicles: { some: { isDeleted: false } } },
      select: { id: true, vehicleType: true, vehicles: { where: { isDeleted: false }, select: { passengerCapacity: true } } },
      orderBy: { vehicleType: 'asc' },
    });
    return vehicleTypes.map((type) => ({
      id: type.id,
      name: type.vehicleType,
      maximumPassengerCapacity: Math.max(...type.vehicles.map((vehicle) => vehicle.passengerCapacity)),
    }));
  }
}
