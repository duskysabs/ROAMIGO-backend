import { Module } from '@nestjs/common';
import { GeoapifyModule } from '../geoapify/geoapify.module.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

@Module({ imports: [GeoapifyModule], controllers: [LocationsController], providers: [LocationsService], exports: [LocationsService] })
export class LocationsModule {}
