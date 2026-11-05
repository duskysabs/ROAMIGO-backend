import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { UpdateEmploymentStatusDto } from './dto/update-employment-status.dto.js';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto.js';
import { StaffService } from './staff.service.js';

@Controller('admin/staff')
@Roles(UserRole.ADMIN)
export class StaffAdminController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Get()
  list(@Query() query: ListStaffQueryDto) {
    return this.staff.list(query);
  }

  @Get(':staffId')
  detail(@Param('staffId', new ParseUUIDPipe()) staffId: string) {
    return this.staff.detail(staffId);
  }

  @Patch(':staffId/profile')
  updateProfile(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @Body() dto: UpdateStaffProfileDto,
  ) {
    return this.staff.updateProfile(staffId, dto);
  }

  @Patch(':staffId/employment-status')
  updateEmploymentStatus(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @Body() dto: UpdateEmploymentStatusDto,
  ) {
    return this.staff.updateEmploymentStatus(staffId, dto.employmentStatus);
  }
}
