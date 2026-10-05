import { Module } from '@nestjs/common';
import { GeoapifyModule } from '../geoapify/geoapify.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { RoutingController } from './routing.controller.js';
import { RoutingService } from './routing.service.js';

@Module({
  imports: [GeoapifyModule, LocationsModule],
  controllers: [RoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
