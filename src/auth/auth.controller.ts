import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './guards/supabase-auth.guard.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

/**
 * Defines authentication HTTP endpoints.
 * 
 * All routes in this controller begin with /auth
 */

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login')
    @HttpCode(HttpStatus.OK)
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Get('me')
    @UseGuards(SupabaseAuthGuard)
    getCurrentUser(@Req() request: AuthenticatedRequest) {
        return {
            user: request.user,
        };
    }
}

