import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SubmitBookingQuoteDto {
  @IsUUID() quoteId!: string;
  @IsString() @MaxLength(100) idempotencyKey!: string;
  @IsOptional() @IsBoolean() requestReviewIfUnavailable?: boolean;
}
