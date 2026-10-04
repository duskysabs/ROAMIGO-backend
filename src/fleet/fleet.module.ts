import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FleetController } from './fleet.controller.js';
import { FleetService } from './fleet.service.js';

@Module({ imports: [AuthModule, PrismaModule], controllers: [FleetController], providers: [FleetService], exports: [FleetService] })
export class FleetModule {}
