import { forwardRef, Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserProfilesModule } from '../user-profiles/user-profiles.module.js';

@Module({
  imports: [SupabaseModule, forwardRef(() => UserProfilesModule)],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard, LoginRateLimitGuard],
  exports: [AuthService, SupabaseAuthGuard],
})
export class AuthModule {}
