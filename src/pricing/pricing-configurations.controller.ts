import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreatePricingConfigurationDto } from './dto/create-pricing-configuration.dto.js';
import { PricingConfigurationsService } from './pricing-configurations.service.js';

@Controller('admin/pricing-configurations')
@Roles(UserRole.ADMIN)
export class PricingConfigurationsController {
  constructor(private readonly pricingConfigurations: PricingConfigurationsService) {}
  @Get() findAll() { return this.pricingConfigurations.findAll(); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() dto: CreatePricingConfigurationDto) { return this.pricingConfigurations.create(request.user!.id, dto); }
  @Post(':configurationId/activate') activate(@Param('configurationId') id: string) { return this.pricingConfigurations.setActive(id, true); }
  @Post(':configurationId/deactivate') deactivate(@Param('configurationId') id: string) { return this.pricingConfigurations.setActive(id, false); }
}
