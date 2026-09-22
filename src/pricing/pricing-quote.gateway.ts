import { ServiceUnavailableException } from '@nestjs/common';
import type { BookingType, StopType } from '../generated/prisma/enums.js';

export type PricingQuoteInput = {
  bookingType: BookingType;
  vehicleTypeId: string;
  startDatetime: Date;
  endDatetime: Date;
  passengerCount: number;
  stops: Array<{ stopType: StopType; latitude: number; longitude: number }>;
};

export type PricingQuote = {
  totalDistanceKm: string;
  estimatedDurationMinutes: number;
  finalQuotedPrice: string;
};

export abstract class PricingQuoteGateway {
  /** Contract implemented by the separate pricing-service repository. */
  abstract quote(input: PricingQuoteInput): Promise<PricingQuote>;
}

export class UnavailablePricingQuoteGateway extends PricingQuoteGateway {
  /** Fail closed until an approved external service is configured. */
  quote(): Promise<PricingQuote> {
    throw new ServiceUnavailableException('Pricing service is not configured');
  }
}
