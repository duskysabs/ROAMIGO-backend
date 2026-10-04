import { Controller, Get, Param, Query, Req, TooManyRequestsException } from '@nestjs/common';
import type { Request } from 'express';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto.js';
import { LocationsService } from './locations.service.js';

const windowMs = 60_000;
const maxRequests = 30;
const requests = new Map<string, number[]>();

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('autocomplete')
  autocomplete(@Req() request: Request, @Query() query: AutocompleteQueryDto) {
    const client = request.ip || 'unknown';
    const now = Date.now();
    const recent = (requests.get(client) ?? []).filter((time) => time > now - windowMs);
    if (recent.length >= maxRequests) throw new TooManyRequestsException('Too many location searches');
    recent.push(now);
    requests.set(client, recent);
    return this.locations.autocomplete(query);
  }

  @Get(':placeId')
  resolve(@Param('placeId') placeId: string) { return this.locations.resolve(placeId); }
}
