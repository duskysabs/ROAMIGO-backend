import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { auditMasterData, requireMasterDataAdmin } from '../common/master-data-audit.js';
import { CreateVehicleTypeDto, UpdateVehicleTypeDto } from './vehicle-types.dto.js';

@Injectable()
export class VehicleTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list(actorUserId: string) {
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, actorUserId);
      return tx.vehicleType.findMany({ select: { id: true, vehicleType: true, isActive: true }, orderBy: { vehicleType: 'asc' } });
    });
  }

  async create(actorUserId: string, dto: CreateVehicleTypeDto) {
    try {
      return await this.prisma.$transaction(async tx => {
        await requireMasterDataAdmin(tx, actorUserId);
        const result = await tx.vehicleType.create({ data: { vehicleType: dto.vehicleType, isActive: false } });
        await auditMasterData(tx, actorUserId, 'VEHICLE_TYPE', result.id, 'CREATE', null, result);
        return result;
      }, { timeout: 15_000 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Vehicle category already exists; change its active status instead');
      }
      throw error;
    }
  }

  update(actorUserId: string, id: string, dto: UpdateVehicleTypeDto) {
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, actorUserId);
      await tx.$queryRaw`SELECT vehicle_type_id FROM public.vehicle_type WHERE vehicle_type_id = ${id}::uuid FOR UPDATE`;
      const before = await tx.vehicleType.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Vehicle type not found');
      if (before.isActive === dto.isActive) return before;
      const result = await tx.vehicleType.update({ where: { id }, data: { isActive: dto.isActive } });
      await auditMasterData(tx, actorUserId, 'VEHICLE_TYPE', id, dto.isActive ? 'ACTIVATE' : 'DEACTIVATE', before, result);
      return result;
    }, { timeout: 15_000 });
  }
}
