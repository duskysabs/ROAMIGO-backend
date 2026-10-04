import { Injectable } from '@nestjs/common';
import { GeoapifyClient } from '../geoapify/geoapify.client.js';
import { AutocompleteQueryDto } from './dto/autocomplete-query.dto.js';

@Injectable()
export class LocationsService {
  constructor(private readonly geoapify: GeoapifyClient) {}
  autocomplete(query: AutocompleteQueryDto) { return this.geoapify.autocomplete(query.text, query.biasLat, query.biasLon); }
  resolve(placeId: string) { return this.geoapify.placeDetails(placeId); }
}
