import { Body, Controller, Get, Param, Patch, Put, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { DesignatedDriverDto } from './dto/designated-driver.dto.js';
import { FleetAvailabilityQueryDto } from './dto/fleet-availability-query.dto.js';
import { ListDriversQueryDto } from './dto/list-drivers-query.dto.js';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto.js';
import { UpdateVehicleStatusDto } from './dto/update-vehicle-status.dto.js';
import { FleetService } from './fleet.service.js';

@Controller('staff')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('vehicles')
  listVehicles(
    @Query() query: ListVehiclesQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.fleet.listVehicles(query, request.user!.profile.role);
  }

  @Get('vehicles/:vehicleId')
  getVehicle(
    @Param('vehicleId') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.fleet.getVehicle(id, request.user!.profile.role);
  }

  @Get('drivers')
  listDrivers(@Query() query: ListDriversQueryDto) {
    return this.fleet.listDrivers(query);
  }

  @Get('drivers/:driverId')
  getDriver(@Param('driverId') id: string) {
    return this.fleet.getDriver(id);
  }

  @Patch('vehicles/:vehicleId/status')
  updateVehicleStatus(
    @Param('vehicleId') id: string,
    @Body() dto: UpdateVehicleStatusDto,
  ) {
    return this.fleet.updateVehicleStatus(id, dto.vehicleStatus);
  }

  @Patch('drivers/:driverId/status')
  updateDriverStatus(
    @Param('driverId') id: string,
    @Body() dto: UpdateDriverStatusDto,
  ) {
    return this.fleet.updateDriverStatus(id, dto.driverStatus);
  }

  @Put('vehicles/:vehicleId/designated-driver')
  designateDriver(
    @Param('vehicleId') id: string,
    @Body() dto: DesignatedDriverDto,
  ) {
    return this.fleet.designateDriver(id, dto.driverId);
  }

  @Get('fleet/availability')
  availability(@Query() query: FleetAvailabilityQueryDto) {
    return this.fleet.availability(query);
  }
}
