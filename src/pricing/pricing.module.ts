import { Module } from '@nestjs/common';
import { PricingQuoteGateway, UnavailablePricingQuoteGateway } from './pricing-quote.gateway.js';

@Module({
  providers: [{ provide: PricingQuoteGateway, useClass: UnavailablePricingQuoteGateway }],
  exports: [PricingQuoteGateway],
})
export class PricingModule {}
