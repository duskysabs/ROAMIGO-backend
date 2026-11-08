import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const reference = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RecordManualPaymentDto {
  @IsIn([PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.E_WALLET, PaymentMethod.OTHER])
  method!: PaymentMethod;

  @Transform(reference)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._:/-]{2,99}$/)
  reference!: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})\.\d{2}$/)
  amount!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReviewManualPaymentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
