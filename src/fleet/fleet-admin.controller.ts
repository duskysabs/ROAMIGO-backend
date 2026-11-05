import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { FleetService } from './fleet.service.js';

@Controller('admin/fleet')
@Roles(UserRole.ADMIN)
export class FleetAdminController {
  constructor(private readonly fleet: FleetService) {}

  @Post('vehicles')
  createVehicle(@Body() dto: CreateVehicleDto) {
    return this.fleet.createVehicle(dto);
  }

  @Patch('vehicles/:vehicleId')
  updateVehicle(
    @Param('vehicleId') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.fleet.updateVehicle(id, dto);
  }

  @Delete('vehicles/:vehicleId')
  deleteVehicle(@Param('vehicleId') id: string) {
    return this.fleet.deleteVehicle(id);
  }

  @Post('drivers')
  createDriver(@Body() dto: CreateDriverDto) {
    return this.fleet.createDriver(dto);
  }

  @Patch('drivers/:driverId')
  updateDriver(
    @Param('driverId') id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.fleet.updateDriver(id, dto);
  }

  @Post('drivers/:driverId/deactivate')
  deactivateDriver(@Param('driverId') id: string) {
    return this.fleet.deactivateDriver(id);
  }
}
