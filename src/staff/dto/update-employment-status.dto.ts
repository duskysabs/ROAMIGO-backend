import { IsEnum } from 'class-validator';
import { EmploymentStatus } from '../../generated/prisma/enums.js';

export class UpdateEmploymentStatusDto {
  @IsEnum(EmploymentStatus)
  employmentStatus!: EmploymentStatus;
}
