import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { VehicleTypesController } from './vehicle-types.controller.js';
import { VehicleTypesService } from './vehicle-types.service.js';

@Module({ imports: [AuthModule, PrismaModule], controllers: [VehicleTypesController], providers: [VehicleTypesService] })
export class VehicleTypesModule {}
