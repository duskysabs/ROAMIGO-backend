import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserProfilesModule } from '../user-profiles/user-profiles.module.js';

@Module({
  imports: [SupabaseModule, UserProfilesModule],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard],
})
export class AuthModule {}