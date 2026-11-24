import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreateVehicleTypeDto, UpdateVehicleTypeDto } from './vehicle-types.dto.js';
import { VehicleTypesService } from './vehicle-types.service.js';

@Controller('admin/vehicle-types')
@Roles(UserRole.ADMIN)
export class VehicleTypesController {
  constructor(private readonly types: VehicleTypesService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.types.list(request.user!.id); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() dto: CreateVehicleTypeDto) { return this.types.create(request.user!.id, dto); }
  @Patch(':vehicleTypeId') update(@Req() request: AuthenticatedRequest, @Param('vehicleTypeId', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleTypeDto) {
    return this.types.update(request.user!.id, id, dto);
  }
}
