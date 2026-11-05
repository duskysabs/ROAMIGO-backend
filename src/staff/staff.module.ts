import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StaffAdminController } from './staff-admin.controller.js';
import { StaffService } from './staff.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StaffAdminController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
