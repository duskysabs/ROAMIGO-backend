import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FleetAdminController } from './fleet-admin.controller.js';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FleetController, FleetAdminController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
