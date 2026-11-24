import { IsBoolean, IsEnum } from 'class-validator';
import { VehicleTypeName } from '../generated/prisma/enums.js';

export class CreateVehicleTypeDto {
  @IsEnum(VehicleTypeName) vehicleType!: VehicleTypeName;
}

export class UpdateVehicleTypeDto {
  @IsBoolean() isActive!: boolean;
}
