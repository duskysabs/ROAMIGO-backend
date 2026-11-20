import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MAX_LOCATION_RESULTS, MAX_PLACE_ID_LENGTH, MAX_ROUTE_STOPS } from '../common/location-limits.js';
import { GeoapifyError } from './geoapify.error.js';

type Operation = 'autocomplete' | 'place-details' | 'routing';
type Location = { placeId: string; formattedAddress: string; latitude: number; longitude: number };
type Position = [number, number] | [number, number, number];
type RouteGeometry = { type: 'LineString'; coordinates: Position[] } | { type: 'MultiLineString'; coordinates: Position[][] };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const coordinate = (latitude: unknown, longitude: unknown) => finite(latitude) && finite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

@Injectable()
export class GeoapifyClient {
  private readonly logger = new Logger(GeoapifyClient.name);
  private readonly enabled: boolean;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor() {
    const enabled = process.env.GEOAPIFY_ENABLED?.trim() ?? 'false';
    if (enabled !== 'true' && enabled !== 'false') throw new Error('GEOAPIFY_ENABLED must be true or false');
    this.enabled = enabled === 'true';
    this.apiKey = process.env.GEOAPIFY_API_KEY?.trim();
    if (this.enabled && (!this.apiKey || /\s/.test(this.apiKey) || this.apiKey.length > 4096)) {
      throw new Error('A valid GEOAPIFY_API_KEY is required when GEOAPIFY_ENABLED is true');
    }
    const timeout = process.env.GEOAPIFY_TIMEOUT_MS ?? '8000';
    this.timeoutMs = Number(timeout);
    if (!/^\d+$/.test(timeout) || !Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 30000) {
      throw new Error('GEOAPIFY_TIMEOUT_MS must be an integer from 1000 to 30000');
    }
  }

  async autocomplete(text: string, biasLat?: number, biasLon?: number): Promise<Location[]> {
    const queryText = typeof text === 'string' ? text.trim() : '';
    if (queryText.length < 3 || queryText.length > 200 ||
        ((biasLat !== undefined || biasLon !== undefined) && !coordinate(biasLat, biasLon))) this.invalidInput();
    const query = new URLSearchParams({ text: queryText, format: 'json', limit: String(MAX_LOCATION_RESULTS) });
    if (biasLat !== undefined && biasLon !== undefined) query.set('bias', `proximity:${biasLon},${biasLat}`);
    return this.execute('autocomplete', '/v1/geocode/autocomplete', query, (payload) => {
      if (!record(payload) || !Array.isArray(payload.results)) throw new GeoapifyError('INVALID_RESPONSE');
      const locations = payload.results.slice(0, MAX_LOCATION_RESULTS).map(value => this.toLocation(value));
      if (locations.some(value => value === null)) throw new GeoapifyError('INVALID_RESPONSE');
      return locations as Location[];
    });
  }

  async placeDetails(placeId: string): Promise<Location> {
    const id = typeof placeId === 'string' ? placeId.trim() : '';
    if (!id || id.length > MAX_PLACE_ID_LENGTH || /\s/.test(id)) this.invalidInput();
    return this.execute('place-details', '/v2/place-details', new URLSearchParams({ id }), (payload) => {
      if (!record(payload) || !Array.isArray(payload.features)) throw new GeoapifyError('INVALID_RESPONSE');
      const details = payload.features.find(value => record(value) && record(value.properties) && value.properties.feature_type === 'details') ?? payload.features[0];
      const location = record(details) ? this.toLocation(details.properties) : null;
      if (!location) throw new GeoapifyError('INVALID_RESPONSE');
      return location;
    });
  }

  async route(locations: Array<{ latitude: number; longitude: number }>) {
    if (locations.length < 2 || locations.length > MAX_ROUTE_STOPS || locations.some(location => !coordinate(location.latitude, location.longitude))) this.invalidInput();
    const waypoints = locations.map(location => `${location.latitude},${location.longitude}`).join('|');
    return this.execute('routing', '/v1/routing', new URLSearchParams({ waypoints, mode: 'drive' }), (payload) => {
      const first = record(payload) && Array.isArray(payload.features) ? payload.features[0] : undefined;
      const properties = record(first) && record(first.properties) ? first.properties : undefined;
      const distanceMeters = properties?.distance;
      const durationSeconds = properties?.time;
      const geometry = record(first) ? this.geometry(first.geometry) : null;
      if (!finite(distanceMeters) || distanceMeters < 0 || !finite(durationSeconds) || durationSeconds < 0 || !geometry) throw new GeoapifyError('INVALID_RESPONSE');
      return { distanceMeters, durationSeconds, geometry };
    });
  }

  private async execute<T>(operation: Operation, path: string, query: URLSearchParams, normalize: (payload: unknown) => T): Promise<T> {
    const started = Date.now();
    let outcome = 'success';
    try {
      if (!this.enabled || !this.apiKey) throw new GeoapifyError('NOT_CONFIGURED');
      query.set('apiKey', this.apiKey);
      const signal = AbortSignal.timeout(this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(`https://api.geoapify.com${path}?${query}`, { signal, redirect: 'error' });
      } catch (error) {
        throw new GeoapifyError(signal.aborted || (error instanceof Error && error.name === 'TimeoutError') ? 'TIMEOUT' : 'UNAVAILABLE');
      }
      if (response.status === 429) throw new GeoapifyError('RATE_LIMITED');
      if (response.status >= 500) throw new GeoapifyError('UNAVAILABLE');
      if (!response.ok) throw new GeoapifyError('REJECTED');
      let payload: unknown;
      try { payload = await response.json(); } catch (error) {
        throw new GeoapifyError(signal.aborted || (error instanceof Error && error.name === 'TimeoutError') ? 'TIMEOUT' : 'INVALID_RESPONSE');
      }
      return normalize(payload);
    } catch (error) {
      const safe = error instanceof GeoapifyError ? error : new GeoapifyError('INVALID_RESPONSE');
      outcome = safe.failure;
      throw safe;
    } finally {
      // Metric events exclude URLs, search text, coordinates and provider error payloads.
      this.logger.log(JSON.stringify({ event: 'geoapify.request', operation, outcome, durationMs: Math.max(0, Date.now() - started) }));
    }
  }

  private toLocation(value: unknown): Location | null {
    if (!record(value) || typeof value.place_id !== 'string' || !value.place_id.trim() || value.place_id.length > MAX_PLACE_ID_LENGTH ||
        typeof value.formatted !== 'string' || !value.formatted.trim() || !coordinate(value.lat, value.lon)) return null;
    return { placeId: value.place_id, formattedAddress: value.formatted, latitude: value.lat as number, longitude: value.lon as number };
  }

  private geometry(value: unknown): RouteGeometry | null {
    if (!record(value) || !Array.isArray(value.coordinates)) return null;
    const position = (point: unknown): point is Position => Array.isArray(point) && (point.length === 2 || point.length === 3) &&
      point.every(finite) && coordinate(point[1], point[0]);
    const line = (points: unknown): points is Position[] => Array.isArray(points) && points.length >= 2 && points.length <= 100000 && points.every(position);
    if (value.type === 'LineString' && line(value.coordinates)) return { type: 'LineString', coordinates: value.coordinates };
    if (value.type === 'MultiLineString' && value.coordinates.length > 0 && value.coordinates.length <= 100 && value.coordinates.every(line)) {
      return { type: 'MultiLineString', coordinates: value.coordinates };
    }
    return null;
  }

  private invalidInput(): never {
    throw new BadRequestException({ statusCode: 400, code: 'LOCATION_INPUT_INVALID', message: 'Invalid location or route input', retryable: false });
  }
}
