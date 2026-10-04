import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { TourPackageStopDto } from './tour-package-stop.dto.js';

export class CreateTourPackageDto {
  @IsString() @IsNotEmpty() @MaxLength(150) packageName!: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) description!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) basePrice!: number;
  @IsInt() @Min(1) estimatedDurationMinutes!: number;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => TourPackageStopDto)
  stops!: TourPackageStopDto[];
}
