import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

const normalizeLicenseNumber = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateDriverDto {
  @IsUUID()
  staffId!: string;

  @Transform(normalizeLicenseNumber)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  licenseNumber!: string;

  @IsDateString()
  licenseExpiry!: string;
}
