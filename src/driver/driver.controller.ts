import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';
import { DriverActionDto, NavigationQueryDto, ProcessExpiredResponsesDto } from './dto/driver-action.dto.js';
import { DriverService } from './driver.service.js';

@Controller('driver')
@Roles(UserRole.DRIVER)
export class DriverController {
  constructor(private readonly drivers: DriverService) {}

  @Get('me') me(@Req() req: AuthenticatedRequest) { return this.drivers.me(req.user!.id); }
  @Get('assignments') list(@Req() req: AuthenticatedRequest, @Query() query: CursorPageQueryDto) { return this.drivers.list(req.user!.id, query); }
  @Get('assignments/:id') detail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.drivers.detail(req.user!.id, id); }
  @Get('trips/:id/navigation-link') navigation(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: NavigationQueryDto) { return this.drivers.navigation(req.user!.id, id, query.stopSequence); }
  @Post('assignments/:id/acknowledge') acknowledge(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'ACKNOWLEDGED', dto.reason); }
  @Post('assignments/:id/decline') decline(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'DECLINED', dto.reason); }
  @Post('trips/:id/en-route') enRoute(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'EN_ROUTE', dto.reason); }
  @Post('trips/:id/arrive') arrive(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'ARRIVED', dto.reason); }
  @Post('trips/:id/start') start(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'STARTED', dto.reason); }
  @Post('trips/:id/complete') complete(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DriverActionDto) { return this.drivers.act(req.user!.id, id, 'ENDED', dto.reason); }
}

@Controller('staff/driver-responses')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class DriverResponseController {
  constructor(private readonly drivers: DriverService) {}
  @Post('process-expired') expire(@Req() req: AuthenticatedRequest, @Body() dto: ProcessExpiredResponsesDto) { return this.drivers.processExpired(req.user!.id, dto.limit); }
}

@Controller('staff/trip-completions')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class TripCompletionController {
  constructor(private readonly drivers: DriverService) {}
  @Get(':id') detail(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.drivers.completion(req.user!.id, id); }
}
