import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';

export class FleetAvailabilityQueryDto {
  @IsDateString() start!: string;
  @IsDateString() end!: string;
  @IsUUID() vehicleTypeId!: string;
  @Type(() => Number) @IsInt() @Min(1) passengers!: number;
}
