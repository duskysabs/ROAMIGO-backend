import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FuelType } from '../../generated/prisma/enums.js';

const normalizePlateNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateVehicleDto {
  @IsUUID()
  vehicleTypeId!: string;

  @Transform(normalizePlateNumber)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  plateNumber!: string;

  @IsEnum(FuelType)
  fuelType!: FuelType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  fuelEfficiency!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  vehicleModel!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengerCapacity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(new Date().getUTCFullYear() + 1)
  yearModel!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  color!: string;
}
