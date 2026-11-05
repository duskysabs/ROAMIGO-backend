import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FuelType } from '../../generated/prisma/enums.js';

const normalizePlateNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateVehicleDto {
  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @IsOptional()
  @Transform(normalizePlateNumber)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  plateNumber?: string;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  fuelEfficiency?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  vehicleModel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengerCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(new Date().getUTCFullYear() + 1)
  yearModel?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  color?: string;
}
