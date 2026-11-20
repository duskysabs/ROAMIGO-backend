import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches, MaxLength } from 'class-validator';
import { MAX_PLACE_ID_LENGTH, MAX_ROUTE_STOPS } from '../../common/location-limits.js';

export class RoutePreviewDto {
  @Transform(({ value }: { value: unknown }) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item.trim() : item) : value)
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(MAX_ROUTE_STOPS) @IsString({ each: true })
  @Matches(/^\S+$/, { each: true }) @MaxLength(MAX_PLACE_ID_LENGTH, { each: true }) placeIds!: string[];
}
