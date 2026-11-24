import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SwitchPricingConfigurationDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true })
  expectedActiveIds!: string[];
}
