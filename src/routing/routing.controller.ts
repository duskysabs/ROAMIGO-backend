import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RoutePreviewDto } from './dto/route-preview.dto.js';
import { RoutingService } from './routing.service.js';
import { LocationRateLimitGuard } from '../geoapify/location-rate-limit.guard.js';

@Controller('routes')
@UseGuards(LocationRateLimitGuard)
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}
  @Post('preview') preview(@Body() dto: RoutePreviewDto) { return this.routing.preview(dto); }
}
