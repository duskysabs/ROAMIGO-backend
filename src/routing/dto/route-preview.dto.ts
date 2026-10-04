import { ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class RoutePreviewDto {
  @IsArray() @ArrayMinSize(2) @IsString({ each: true }) @MaxLength(500, { each: true }) placeIds!: string[];
}
