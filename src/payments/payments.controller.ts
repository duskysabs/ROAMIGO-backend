import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';
import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { RecordManualPaymentDto, ReviewManualPaymentDto } from './dto/manual-payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { PaymongoService } from './paymongo.service.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly paymongo: PaymongoService) {}

  @Post('bookings/:bookingId/payments/paymongo/checkout')
  @Roles(UserRole.CUSTOMER)
  checkout(@Req() request: AuthenticatedRequest, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() body?: Record<string, unknown>) {
    if (body && Object.keys(body).length) throw new BadRequestException('Checkout does not accept client payment details');
    return this.paymongo.createCheckout(request.user!.id, bookingId);
  }

  @Post('webhooks/paymongo/test')
  @HttpCode(200)
  webhook(@Req() request: Request & { rawBody?: Buffer }) {
    const signature = request.headers['paymongo-signature'];
    return this.paymongo.acceptWebhook(typeof signature === 'string' ? signature : undefined, request.rawBody);
  }

  @Post('staff/bookings/:bookingId/payments/manual')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  record(@Req() request: AuthenticatedRequest, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: RecordManualPaymentDto) {
    return this.payments.record(request.user!.id, bookingId, dto);
  }

  @Get('bookings/:bookingId/payments')
  @Roles(UserRole.CUSTOMER)
  mine(@Req() request: AuthenticatedRequest, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Query() query: CursorPageQueryDto) {
    return this.payments.listMine(request.user!.id, bookingId, query);
  }

  @Get('staff/payment-reviews')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  pending(@Req() request: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.payments.pending(request.user!.id, query);
  }

  @Post('staff/payment-reviews/:paymentId/approve')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  approve(@Req() request: AuthenticatedRequest, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() dto: ReviewManualPaymentDto) {
    return this.payments.review(request.user!.id, paymentId, true, dto);
  }

  @Post('staff/payment-reviews/:paymentId/reject')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  reject(@Req() request: AuthenticatedRequest, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Body() dto: ReviewManualPaymentDto) {
    return this.payments.review(request.user!.id, paymentId, false, dto);
  }
}
