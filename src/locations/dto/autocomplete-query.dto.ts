import { Transform } from 'class-transformer';
import { IsDefined, IsLatitude, IsLongitude, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const numeric = ({ value }: { value: unknown }) => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

export class AutocompleteQueryDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(3) @MaxLength(200) text!: string;
  @ValidateIf((value: AutocompleteQueryDto) => value.biasLat !== undefined || value.biasLon !== undefined)
  @IsDefined() @Transform(numeric) @IsLatitude() biasLat?: number;
  @ValidateIf((value: AutocompleteQueryDto) => value.biasLat !== undefined || value.biasLon !== undefined)
  @IsDefined() @Transform(numeric) @IsLongitude() biasLon?: number;
}
