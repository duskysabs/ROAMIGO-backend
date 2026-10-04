import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TourPackagesController } from './tour-packages.controller.js';
import { TourPackagesService } from './tour-packages.service.js';

@Module({ imports: [AuthModule, PrismaModule], controllers: [TourPackagesController], providers: [TourPackagesService], exports: [TourPackagesService] })
export class TourPackagesModule {}
