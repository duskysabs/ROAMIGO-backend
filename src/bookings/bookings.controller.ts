import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('me')
  @Roles(UserRole.CUSTOMER)
  findMine(@Req() request: AuthenticatedRequest) {
    return this.bookingsService.findMine(request.user!.id);
  }

  @Post()
  @Roles(UserRole.CUSTOMER)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(request.user!.id, dto);
  }

  @Get(':bookingId')
  @Roles(UserRole.CUSTOMER)
  findOneMine(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingsService.findOneMine(request.user!.id, bookingId);
  }
}
