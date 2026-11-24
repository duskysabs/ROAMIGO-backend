import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePricingConfigurationDto } from './dto/create-pricing-configuration.dto.js';
import { auditMasterData, requireMasterDataAdmin } from '../common/master-data-audit.js';

@Injectable()
export class PricingConfigurationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(actorUserId: string) {
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, actorUserId);
      return tx.pricingConfiguration.findMany({ orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }], include: { vehicleType: true } });
    });
  }

  async create(adminUserId: string, dto: CreatePricingConfigurationDto) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    if (effectiveUntil && effectiveUntil <= effectiveFrom) throw new BadRequestException('Effective end must be after effective start');
    if (dto.minAdjustmentPct > dto.maxAdjustmentPct) throw new BadRequestException('Minimum adjustment cannot exceed maximum adjustment');
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, adminUserId);
      const vehicleType = await tx.vehicleType.findUnique({ where: { id: dto.vehicleTypeId }, select: { id: true } });
      if (!vehicleType) throw new NotFoundException('Vehicle type not found');
      const result = await tx.pricingConfiguration.create({ data: { ...dto, effectiveFrom, effectiveUntil, updatedByAdminId: adminUserId, isActive: false } });
      await auditMasterData(tx, adminUserId, 'PRICING_CONFIGURATION', result.id, 'CREATE', null, result);
      return result;
    }, { timeout: 15_000 });
  }

  async setActive(adminUserId: string, id: string, isActive: boolean) {
    return this.prisma.$transaction(async tx => {
      await requireMasterDataAdmin(tx, adminUserId);
      const initial = await tx.pricingConfiguration.findUnique({ where: { id }, select: { vehicleTypeId: true } });
      if (!initial) throw new NotFoundException('Pricing configuration not found');
      // Serialize activation of different pricing rows for the same category.
      await tx.$queryRaw`SELECT vehicle_type_id FROM public.vehicle_type WHERE vehicle_type_id = ${initial.vehicleTypeId}::uuid FOR UPDATE`;
      const configuration = await tx.pricingConfiguration.findUnique({ where: { id } });
      if (!configuration) throw new NotFoundException('Pricing configuration not found');
      if (isActive) {
        const overlaps = await tx.pricingConfiguration.count({ where: { id: { not: id }, vehicleTypeId: configuration.vehicleTypeId, isActive: true, effectiveFrom: { lte: configuration.effectiveUntil ?? new Date('9999-12-31') }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: configuration.effectiveFrom } }] } });
        if (overlaps) throw new ConflictException('An active pricing configuration already overlaps this effective period');
      }
      if (configuration.isActive === isActive) return configuration;
      const result = await tx.pricingConfiguration.update({ where: { id }, data: { isActive, updatedByAdminId: adminUserId } });
      await auditMasterData(tx, adminUserId, 'PRICING_CONFIGURATION', id, isActive ? 'ACTIVATE' : 'DEACTIVATE', configuration, result);
      return result;
    }, { timeout: 15_000 });
  }
}
