import { Injectable } from '@nestjs/common';
import { GeoapifyClient } from '../geoapify/geoapify.client.js';
import { LocationsService } from '../locations/locations.service.js';
import { RoutePreviewDto } from './dto/route-preview.dto.js';

@Injectable()
export class RoutingService {
  constructor(private readonly locations: LocationsService, private readonly geoapify: GeoapifyClient) {}

  async preview(dto: RoutePreviewDto) {
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
