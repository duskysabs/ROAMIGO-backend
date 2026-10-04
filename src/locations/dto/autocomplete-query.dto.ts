import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class AutocompleteQueryDto {
  @IsString() @MinLength(3) @MaxLength(200) text!: string;
  @IsOptional() @Type(() => Number) @IsLatitude() biasLat?: number;
  @ValidateIf((value: AutocompleteQueryDto) => value.biasLat !== undefined)
  @Type(() => Number) @IsLongitude() biasLon?: number;
}
