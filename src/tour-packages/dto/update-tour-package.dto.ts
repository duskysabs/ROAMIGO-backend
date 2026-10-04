import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateTourPackageDto {
  @IsOptional() @IsString() @MaxLength(150) packageName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) basePrice?: number;
  @IsOptional() @IsInt() @Min(1) estimatedDurationMinutes?: number;
}
