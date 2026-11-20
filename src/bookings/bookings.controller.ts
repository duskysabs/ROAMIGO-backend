import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListMyBookingsDto } from './dto/list-my-bookings.dto.js';
import { SubmitBookingQuoteDto } from './dto/submit-booking-quote.dto.js';
import { BookingReviewsService } from './booking-reviews.service.js';
import { BookingReviewDecisionDto } from './dto/booking-review-decision.dto.js';
import { CancelUnpaidBookingDto } from './dto/cancel-unpaid-booking.dto.js';
import { UnpaidCancellationsService } from './unpaid-cancellations.service.js';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingReviews: BookingReviewsService,
    private readonly cancellations: UnpaidCancellationsService,
  ) {}

  @Get('me')
  @Roles(UserRole.CUSTOMER)
  findMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListMyBookingsDto,
  ) {
    return this.bookingsService.findMine(request.user!.id, query);
  }

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SubmitBookingQuoteDto,
  ) {
    return this.bookingsService.submitQuote(request.user!.id, dto);
  }

  @Post('quote')
  @Roles(UserRole.CUSTOMER)
  previewQuote(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.issueQuote(request.user!.id, dto);
  }

  @Get(':bookingId')
  @Roles(UserRole.CUSTOMER)
  findOneMine(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingsService.findOneMine(request.user!.id, bookingId);
  }

  @Post(':bookingId/cancel')
  @Roles(UserRole.CUSTOMER)
  cancel(@Req() request: AuthenticatedRequest, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: CancelUnpaidBookingDto) {
    return this.cancellations.cancel(request.user!.id, bookingId, dto);
  }

  @Post(':bookingId/review-decision')
  @Roles(UserRole.CUSTOMER)
  decideReview(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() dto: BookingReviewDecisionDto,
  ) {
    return this.bookingReviews.decide(request.user!.id, bookingId, dto);
  }
}
