import { IsOptional, IsUUID } from 'class-validator';

export class DesignatedDriverDto { @IsOptional() @IsUUID() driverId?: string | null; }
