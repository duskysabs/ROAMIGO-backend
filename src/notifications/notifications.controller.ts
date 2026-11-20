import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notifications.list(request.user!.id, query);
  }

  @Get('unread-count')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notifications.unreadCount(request.user!.id);
  }

  @Patch('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.user!.id);
  }

  @Patch(':notificationId/read')
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(request.user!.id, notificationId);
  }
}
