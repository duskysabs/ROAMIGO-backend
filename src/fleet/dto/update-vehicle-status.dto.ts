import { IsEnum } from 'class-validator';
import { VehicleStatus } from '../../generated/prisma/enums.js';

export class UpdateVehicleStatusDto { @IsEnum(VehicleStatus) vehicleStatus!: VehicleStatus; }
