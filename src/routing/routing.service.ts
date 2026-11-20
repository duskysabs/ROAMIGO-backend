import { BadRequestException, Injectable } from '@nestjs/common';
import { GeoapifyClient } from '../geoapify/geoapify.client.js';
import { LocationsService } from '../locations/locations.service.js';
import { RoutePreviewDto } from './dto/route-preview.dto.js';
import { MAX_PLACE_ID_LENGTH, MAX_ROUTE_STOPS } from '../common/location-limits.js';

@Injectable()
export class RoutingService {
  constructor(private readonly locations: LocationsService, private readonly geoapify: GeoapifyClient) {}

  async preview(dto: RoutePreviewDto) {
    if (!Array.isArray(dto.placeIds) || dto.placeIds.length < 2 || dto.placeIds.length > MAX_ROUTE_STOPS ||
        dto.placeIds.some(id => typeof id !== 'string' || !id.trim() || id.length > MAX_PLACE_ID_LENGTH || /\s/.test(id))) {
      throw new BadRequestException({ statusCode: 400, code: 'LOCATION_INPUT_INVALID', message: 'Use 2 to 10 valid location IDs', retryable: false });
    }
    const stops = await Promise.all(dto.placeIds.map((placeId) => this.locations.resolve(placeId)));
    const route = await this.geoapify.route(stops);
    return {
      stops,
      totalDistanceKm: (route.distanceMeters / 1000).toFixed(2),
      estimatedDurationMinutes: Math.ceil(route.durationSeconds / 60),
      geometry: route.geometry,
      provider: 'geoapify',
    };
  }
}
