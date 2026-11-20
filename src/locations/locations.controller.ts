import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto.js';
import { LocationsService } from './locations.service.js';
import { LocationRateLimitGuard } from '../geoapify/location-rate-limit.guard.js';
import { ResolvePlaceDto } from './dto/resolve-place.dto.js';

@Controller('locations')
@UseGuards(LocationRateLimitGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteQueryDto) { return this.locations.autocomplete(query); }

  @Get(':placeId')
  resolve(@Param() params: ResolvePlaceDto) { return this.locations.resolve(params.placeId); }
}
