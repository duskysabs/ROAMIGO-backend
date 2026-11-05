import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { BookingReviewsService } from './booking-reviews.service.js';
import { RecordOutsourcedDetailsDto } from './dto/record-outsourced-details.dto.js';
import { RejectBookingReviewDto } from './dto/reject-booking-review.dto.js';

@Controller('staff/booking-reviews')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class BookingReviewsController {
  constructor(private readonly bookingReviews: BookingReviewsService) {}

  @Get()
  listPending() {
    return this.bookingReviews.listPending();
  }

  @Get(':bookingId')
  findPending(@Param('bookingId') bookingId: string) {
    return this.bookingReviews.findPending(bookingId);
  }

  @Put(':bookingId/outsourced-details')
  recordOutsourcedDetails(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() dto: RecordOutsourcedDetailsDto,
  ) {
    return this.bookingReviews.recordOutsourcedDetails(
      request.user!.id,
      bookingId,
      dto,
    );
  }

  @Post(':bookingId/reject')
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() dto: RejectBookingReviewDto,
  ) {
    return this.bookingReviews.rejectByStaff(
      request.user!.id,
      bookingId,
      dto.reason,
    );
  }
}
