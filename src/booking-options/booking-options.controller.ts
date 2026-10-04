import { Controller, Get } from '@nestjs/common';
import { BookingOptionsService } from './booking-options.service.js';

@Controller('booking-options')
export class BookingOptionsController {
  constructor(private readonly bookingOptions: BookingOptionsService) {}
  @Get('vehicle-types') vehicleTypes() { return this.bookingOptions.vehicleTypes(); }
}
