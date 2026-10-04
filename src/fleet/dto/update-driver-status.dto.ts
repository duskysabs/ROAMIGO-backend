import { IsEnum } from 'class-validator';
import { DriverStatus } from '../../generated/prisma/enums.js';

export class UpdateDriverStatusDto { @IsEnum(DriverStatus) driverStatus!: DriverStatus; }
