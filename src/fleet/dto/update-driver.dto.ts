import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const normalizeLicenseNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateDriverDto {
  @IsOptional()
  @Transform(normalizeLicenseNumber)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  licenseNumber?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;
}
