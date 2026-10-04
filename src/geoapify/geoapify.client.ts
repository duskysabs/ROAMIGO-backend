import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

type GeoapifyFeature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };
type GeoapifyCollection = { results?: Array<Record<string, unknown>>; features?: GeoapifyFeature[] };

@Injectable()
export class GeoapifyClient {
  private readonly enabled = process.env.GEOAPIFY_ENABLED === 'true';
  private readonly apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  constructor() {
    if (this.enabled && !this.apiKey) {
      throw new Error('GEOAPIFY_API_KEY is required when GEOAPIFY_ENABLED is true');
    }
  }

  async autocomplete(text: string, biasLat?: number, biasLon?: number) {
    const query = new URLSearchParams({ text, format: 'json', limit: '8' });
    if (biasLat !== undefined && biasLon !== undefined) query.set('bias', `proximity:${biasLon},${biasLat}`);
    const payload = await this.request('/v1/geocode/autocomplete', query) as GeoapifyCollection;
    return (payload.results ?? []).flatMap((result) => this.toLocation(result));
  }

  async placeDetails(placeId: string) {
    const payload = await this.request('/v2/place-details', new URLSearchParams({ id: placeId })) as GeoapifyCollection;
    const feature = payload.features?.find((item) => item.properties?.feature_type === 'details') ?? payload.features?.[0];
    const location = feature ? this.toLocation(feature.properties ?? {})[0] : undefined;
    if (!location) throw new BadGatewayException('Location provider returned no usable place details');
    return location;
  }

  async route(locations: Array<{ latitude: number; longitude: number }>) {
    const waypoints = locations.map((location) => `${location.latitude},${location.longitude}`).join('|');
    const payload = await this.request('/v1/routing', new URLSearchParams({ waypoints, mode: 'drive' })) as GeoapifyCollection;
    const route = payload.features?.[0];
    const properties = route?.properties;
    const distanceMeters = this.numberValue(properties?.distance);
    const durationSeconds = this.numberValue(properties?.time);
    if (distanceMeters === undefined || durationSeconds === undefined || !route?.geometry) {
      throw new BadGatewayException('Routing provider returned no usable route');
    }
    return { distanceMeters, durationSeconds, geometry: route.geometry };
  }

  private async request(path: string, query: URLSearchParams): Promise<unknown> {
    if (!this.enabled || !this.apiKey) {
      throw new ServiceUnavailableException('Location and routing services are not configured');
    }
    query.set('apiKey', this.apiKey);
    let response: Response;
    try {
      response = await fetch(`https://api.geoapify.com${path}?${query}`, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new ServiceUnavailableException('Location provider is unavailable');
    }
    if (response.status === 429) throw new ServiceUnavailableException('Location provider rate limit reached');
    if (!response.ok) throw new BadGatewayException('Location provider returned an invalid response');
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Location provider returned invalid JSON');
    }
  }

  private toLocation(value: Record<string, unknown>) {
    const placeId = typeof value.place_id === 'string' ? value.place_id : undefined;
    const formattedAddress = typeof value.formatted === 'string' ? value.formatted : undefined;
    const latitude = this.numberValue(value.lat);
    const longitude = this.numberValue(value.lon);
    if (!placeId || !formattedAddress || latitude === undefined || longitude === undefined) return [];
    return [{ placeId, formattedAddress, latitude, longitude }];
  }

  private numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
