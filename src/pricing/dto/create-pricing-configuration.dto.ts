import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreatePricingConfigurationDto {
  @IsUUID() vehicleTypeId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) baseRate!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAdjustmentPct!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAdjustmentPct!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
}
