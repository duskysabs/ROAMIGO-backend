import { IsEnum, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { StopType } from '../../generated/prisma/enums.js';

export class TourPackageStopDto {
  @IsEnum(StopType) stopType!: StopType;
  @IsString() @IsNotEmpty() @MaxLength(150) locationName!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) activity!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) formattedAddress!: string;
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
  @IsInt() @Min(0) defaultStopMinutes!: number;
}
