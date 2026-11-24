import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { TourPackageStopDto } from './tour-package-stop.dto.js';

export class ReplaceTourPackageStopsDto {
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => TourPackageStopDto)
  stops!: TourPackageStopDto[];
}
