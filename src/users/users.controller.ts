import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getMyProfile(@Req() request: AuthenticatedRequest) {
    if (!request.user) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return this.usersService.getProfile(request.user.id);
  }

  @Patch('me')
  @UseGuards(SupabaseAuthGuard)
  updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ) {
    if (!request.user) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return this.usersService.updateProfile(request.user.id, dto);
  }
}
