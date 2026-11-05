import { IsEnum } from 'class-validator';

export enum BookingReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class BookingReviewDecisionDto {
  @IsEnum(BookingReviewDecision) decision!: BookingReviewDecision;
}
