import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordOutsourcedDetailsDto {
  @IsString() @IsNotEmpty() @MaxLength(150) vehicleModel!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) plateNumber!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) vehicleProvider!: string;
  @IsString() @IsNotEmpty() @MaxLength(150) driverName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) driverContact!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) agreedCost!: number;
}
