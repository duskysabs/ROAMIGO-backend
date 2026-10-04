import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePricingConfigurationDto } from './dto/create-pricing-configuration.dto.js';

@Injectable()
export class PricingConfigurationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() { return this.prisma.pricingConfiguration.findMany({ orderBy: { effectiveFrom: 'desc' }, include: { vehicleType: true } }); }

  async create(adminUserId: string, dto: CreatePricingConfigurationDto) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    if (effectiveUntil && effectiveUntil <= effectiveFrom) throw new BadRequestException('Effective end must be after effective start');
    if (dto.minAdjustmentPct > dto.maxAdjustmentPct) throw new BadRequestException('Minimum adjustment cannot exceed maximum adjustment');
    const vehicleType = await this.prisma.vehicleType.findUnique({ where: { id: dto.vehicleTypeId }, select: { id: true } });
    if (!vehicleType) throw new NotFoundException('Vehicle type not found');
    return this.prisma.pricingConfiguration.create({ data: { ...dto, effectiveFrom, effectiveUntil, updatedByAdminId: adminUserId, isActive: false } });
  }

  async setActive(id: string, isActive: boolean) {
    const configuration = await this.prisma.pricingConfiguration.findUnique({ where: { id } });
    if (!configuration) throw new NotFoundException('Pricing configuration not found');
    if (isActive) {
      const overlaps = await this.prisma.pricingConfiguration.count({ where: { id: { not: id }, vehicleTypeId: configuration.vehicleTypeId, isActive: true, effectiveFrom: { lte: configuration.effectiveUntil ?? new Date('9999-12-31') }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: configuration.effectiveFrom } }] } });
      if (overlaps) throw new ConflictException('An active pricing configuration already overlaps this effective period');
    }
    return this.prisma.pricingConfiguration.update({ where: { id }, data: { isActive } });
  }
}
