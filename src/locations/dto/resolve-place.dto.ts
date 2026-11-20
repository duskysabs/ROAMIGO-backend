import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MAX_PLACE_ID_LENGTH } from '../../common/location-limits.js';

export class ResolvePlaceDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(MAX_PLACE_ID_LENGTH) @Matches(/^\S+$/)
  placeId!: string;
}
