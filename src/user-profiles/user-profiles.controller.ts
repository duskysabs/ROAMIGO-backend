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
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserProfilesService } from './user-profiles.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js'
import { RolesGuard } from '../auth/guards/roles.guard.js'
import { UserRole } from '../generated/prisma/enums.js'

@Controller('user-profiles')
export class UserProfilesController {
    constructor ( private readonly userProfilesService: UserProfilesService) {}

    @Patch('me')
    @UseGuards(SupabaseAuthGuard)
    updateMyProfile(
        @Req() request: AuthenticatedRequest,
        @Body() dto: UpdateProfileDto,
    ) {
        if(!request.user) {
            throw new UnauthorizedException('Authenticated user not found');
        }

        return this.userProfilesService.updateProfile(
            request.user.id,
            dto,
        );
    }

    @Get()
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    findAll(){
        return this.userProfilesService.findAll();
    }
}
