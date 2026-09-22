import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { BookingType, StopType } from '../../generated/prisma/enums.js';

class CreateBookingStopDto {
  @IsEnum(StopType) stopType: StopType;
  @IsString() @MaxLength(150) locationName: string;
  @IsString() @MaxLength(255) formattedAddress: string;
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
  @IsOptional() @IsString() @MaxLength(255) activity?: string;
  @IsOptional() @IsInt() @Min(0) plannedStopMinutes?: number;
}

export class CreateBookingDto {
  @IsUUID() vehicleTypeId: string;
  @IsEnum(BookingType) bookingType: BookingType;
  @IsOptional() @IsUUID() tourPackageId?: string;
  @IsDateString() startDatetime: string;
  @IsDateString() endDatetime: string;
  @IsInt() @Min(1) passengerCount: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  // Required for Custom Trips only; Tour Package routes are loaded server-side.
  @IsOptional() @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => CreateBookingStopDto) stops?: CreateBookingStopDto[];
}
