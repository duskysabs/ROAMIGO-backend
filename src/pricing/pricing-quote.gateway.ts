import { ConflictException, Injectable } from '@nestjs/common';
import { BookingType, type StopType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type PricingQuoteInput = {
  bookingType: BookingType;
  vehicleTypeId: string;
  startDatetime: Date;
  endDatetime: Date;
  passengerCount: number;
  stops: Array<{ stopType: StopType; latitude: number; longitude: number }>;
  tourPackageBasePrice?: string;
  tourPackageDurationMinutes?: number;
};

export type PricingQuote = {
  totalDistanceKm: string;
  estimatedDurationMinutes: number;
  finalQuotedPrice: string;
  pricingConfigurationId: string;
  baseRateUsed: string;
  adjustmentPercentage: string;
  modelVersion: string;
};

export abstract class PricingQuoteGateway {
  /** Contract implemented by the separate pricing-service repository. */
  abstract quote(input: PricingQuoteInput): Promise<PricingQuote>;
}

@Injectable()
export class AdminPricingQuoteGateway extends PricingQuoteGateway {
  constructor(private readonly prisma: PrismaService) { super(); }

  // The demo policy is deliberately fixed-price. Geoapify route metrics and the
  // FastAPI RFR model replace this boundary later without accepting client price.
  async quote(input: PricingQuoteInput): Promise<PricingQuote> {
    const now = new Date();
    const configurations = await this.prisma.pricingConfiguration.findMany({ where: { vehicleTypeId: input.vehicleTypeId, isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] } });
    if (configurations.length !== 1) throw new ConflictException('No single active pricing configuration applies to this vehicle type');
    const configuration = configurations[0];
    const baseRate = Number(configuration.baseRate);
    const packagePrice = input.bookingType === BookingType.TOUR_PACKAGE ? Number(input.tourPackageBasePrice) : 0;
    const finalPrice = packagePrice + baseRate;
    const duration = input.tourPackageDurationMinutes ?? Math.round((input.endDatetime.getTime() - input.startDatetime.getTime()) / 60000);
    return { totalDistanceKm: '0.00', estimatedDurationMinutes: duration, finalQuotedPrice: finalPrice.toFixed(2), pricingConfigurationId: configuration.id, baseRateUsed: baseRate.toFixed(2), adjustmentPercentage: '0.00', modelVersion: 'admin-fixed-v1' };
  }
}
