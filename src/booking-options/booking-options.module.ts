import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BookingOptionsController } from './booking-options.controller.js';
import { BookingOptionsService } from './booking-options.service.js';

@Module({ imports: [PrismaModule], controllers: [BookingOptionsController], providers: [BookingOptionsService] })
export class BookingOptionsModule {}
