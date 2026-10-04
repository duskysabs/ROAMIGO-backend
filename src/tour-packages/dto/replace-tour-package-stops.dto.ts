import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { TourPackageStopDto } from './tour-package-stop.dto.js';

export class ReplaceTourPackageStopsDto {
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => TourPackageStopDto)
  stops!: TourPackageStopDto[];
}
