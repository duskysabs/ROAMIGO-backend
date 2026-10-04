import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/guards/supabase-auth.guard.js';
import { PackageStatus, UserRole } from '../generated/prisma/enums.js';
import { CreateTourPackageDto } from './dto/create-tour-package.dto.js';
import { ReplaceTourPackageStopsDto } from './dto/replace-tour-package-stops.dto.js';
import { UpdateTourPackageDto } from './dto/update-tour-package.dto.js';
import { TourPackagesService } from './tour-packages.service.js';

@Controller()
export class TourPackagesController {
  constructor(private readonly tourPackagesService: TourPackagesService) {}

  @Get('tour-packages')
  findForCustomers() { return this.tourPackagesService.findForCustomers(); }

  @Get('staff/tour-packages')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  findForStaff() { return this.tourPackagesService.findForStaff(); }

  @Post('admin/tour-packages')
  @Roles(UserRole.ADMIN)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTourPackageDto) {
    return this.tourPackagesService.create(request.user!.id, dto);
  }

  @Patch('admin/tour-packages/:tourPackageId')
  @Roles(UserRole.ADMIN)
  update(@Param('tourPackageId') id: string, @Body() dto: UpdateTourPackageDto) {
    return this.tourPackagesService.update(id, dto);
  }

  @Put('admin/tour-packages/:tourPackageId/stops')
  @Roles(UserRole.ADMIN)
  replaceStops(@Param('tourPackageId') id: string, @Body() dto: ReplaceTourPackageStopsDto) {
    return this.tourPackagesService.replaceStops(id, dto);
  }

  @Post('admin/tour-packages/:tourPackageId/activate')
  @Roles(UserRole.ADMIN)
  activate(@Param('tourPackageId') id: string) { return this.tourPackagesService.setStatus(id, PackageStatus.ACTIVE); }

  @Post('admin/tour-packages/:tourPackageId/deactivate')
  @Roles(UserRole.ADMIN)
  deactivate(@Param('tourPackageId') id: string) { return this.tourPackagesService.setStatus(id, PackageStatus.INACTIVE); }
}
