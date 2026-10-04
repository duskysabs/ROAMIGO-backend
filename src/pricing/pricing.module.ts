import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminPricingQuoteGateway, PricingQuoteGateway } from './pricing-quote.gateway.js';
import { PricingConfigurationsController } from './pricing-configurations.controller.js';
import { PricingConfigurationsService } from './pricing-configurations.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PricingConfigurationsController],
  providers: [PricingConfigurationsService, { provide: PricingQuoteGateway, useClass: AdminPricingQuoteGateway }],
  exports: [PricingQuoteGateway],
})
export class PricingModule {}
