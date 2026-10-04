import { Body, Controller, Post } from '@nestjs/common';
import { RoutePreviewDto } from './dto/route-preview.dto.js';
import { RoutingService } from './routing.service.js';

@Controller('routes')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}
  @Post('preview') preview(@Body() dto: RoutePreviewDto) { return this.routing.preview(dto); }
}
