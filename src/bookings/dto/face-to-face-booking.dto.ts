import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto.js';

export class FaceToFaceQuoteDto extends CreateBookingDto {
  @IsUUID() customerUserId!: string;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
