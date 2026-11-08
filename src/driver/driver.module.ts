import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { DriverController, DriverResponseController, TripCompletionController } from './driver.controller.js';
import { DriverService } from './driver.service.js';

@Module({ imports: [AuthModule, PrismaModule, AssignmentsModule], controllers: [DriverController, DriverResponseController, TripCompletionController], providers: [DriverService], exports: [DriverService] })
export class DriverModule {}
