import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class SubmitBookingQuoteDto {
  @IsUUID() quoteId!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(100) idempotencyKey!: string;
  @IsOptional() @IsBoolean() requestReviewIfUnavailable?: boolean;
}
