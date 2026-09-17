import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UserProfilesService } from './user-profiles.service.js';
import { UserProfilesController } from './user-profiles.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  providers: [UserProfilesService, RolesGuard],
  exports: [UserProfilesService],
  controllers: [UserProfilesController],
})
export class UserProfilesModule {}
