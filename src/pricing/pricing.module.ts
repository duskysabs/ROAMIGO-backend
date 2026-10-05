import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminPricingQuoteGateway, PricingQuoteGateway } from './pricing-quote.gateway.js';
import { PricingConfigurationsController } from './pricing-configurations.controller.js';
import { PricingConfigurationsService } from './pricing-configurations.service.js';

@Module({
  // The Admin pricing controller uses Roles, which constructs the Supabase
  // auth guard in this module's context.
  imports: [AuthModule, PrismaModule],
  controllers: [PricingConfigurationsController],
  providers: [PricingConfigurationsService, { provide: PricingQuoteGateway, useClass: AdminPricingQuoteGateway }],
  exports: [PricingQuoteGateway],
})
export class PricingModule {}
