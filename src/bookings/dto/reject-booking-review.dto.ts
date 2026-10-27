import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectBookingReviewDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}
