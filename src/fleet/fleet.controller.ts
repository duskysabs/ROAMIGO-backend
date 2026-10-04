import { Controller, Get, Param, Patch, Put, Body, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { DesignatedDriverDto } from './dto/designated-driver.dto.js';
import { FleetAvailabilityQueryDto } from './dto/fleet-availability-query.dto.js';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto.js';
import { UpdateVehicleStatusDto } from './dto/update-vehicle-status.dto.js';
import { FleetService } from './fleet.service.js';

@Controller('staff')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}
  @Get('vehicles') listVehicles() { return this.fleet.listVehicles(); }
  @Get('drivers') listDrivers() { return this.fleet.listDrivers(); }
  @Patch('vehicles/:vehicleId/status') updateVehicleStatus(@Param('vehicleId') id: string, @Body() dto: UpdateVehicleStatusDto) { return this.fleet.updateVehicleStatus(id, dto.vehicleStatus); }
  @Patch('drivers/:driverId/status') updateDriverStatus(@Param('driverId') id: string, @Body() dto: UpdateDriverStatusDto) { return this.fleet.updateDriverStatus(id, dto.driverStatus); }
  @Put('vehicles/:vehicleId/designated-driver') designateDriver(@Param('vehicleId') id: string, @Body() dto: DesignatedDriverDto) { return this.fleet.designateDriver(id, dto.driverId); }
  @Get('fleet/availability') availability(@Query() query: FleetAvailabilityQueryDto) { return this.fleet.availability(query); }
}
