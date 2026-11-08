import { CursorPageQueryDto } from '../common/dto/cursor-page-query.dto.js';
import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { AssignmentsService } from './assignments.service.js';

@Controller('staff/assignment-requests')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  pending(@Req() request: AuthenticatedRequest, @Query() query: CursorPageQueryDto) {
    return this.assignments.pending(request.user!.id, query);
  }

  @Post(':bookingId/retry')
  retry(@Req() request: AuthenticatedRequest, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.assignments.retry(request.user!.id, bookingId);
  }
}
