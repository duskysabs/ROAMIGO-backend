import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { RoutingModule } from '../routing/routing.module.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BookingReviewsController } from './booking-reviews.controller.js';
import { BookingReviewsService } from './booking-reviews.service.js';

@Module({
  imports: [AuthModule, PrismaModule, PricingModule, RoutingModule],
  controllers: [BookingsController, BookingReviewsController],
  providers: [BookingsService, BookingReviewsService],
  exports: [BookingsService, BookingReviewsService],
})
export class BookingsModule {}
