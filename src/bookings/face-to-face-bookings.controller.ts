import { Body, Controller, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { BookingsService } from './bookings.service.js';
import { FaceToFaceQuoteDto } from './dto/face-to-face-booking.dto.js';
import { SubmitBookingQuoteDto } from './dto/submit-booking-quote.dto.js';

@Controller('staff/bookings/face-to-face')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class FaceToFaceBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('quote')
  quote(@Req() request: AuthenticatedRequest, @Body() dto: FaceToFaceQuoteDto) {
    return this.bookings.issueFaceToFaceQuote(request.user!.id, dto);
  }

  @Post()
  submit(@Req() request: AuthenticatedRequest, @Body() dto: SubmitBookingQuoteDto) {
    return this.bookings.submitFaceToFaceQuote(request.user!.id, dto);
  }
}
