# Location and routing API contract

The backend owns Geoapify communication. Clients never receive the Geoapify API
key and should use normalized ROAMIGO location objects instead of provider
payloads.

## Configuration

Set `GEOAPIFY_ENABLED=true` and `GEOAPIFY_API_KEY=<server-side key>` only in an
approved non-production or production environment. Startup fails when enabled
without a key. When disabled, location and route endpoints return a stable
service-unavailable response instead of pretending that route data is valid.

## Endpoints

- `GET /locations/autocomplete?text=&biasLat=&biasLon=` requires at least three
  text characters and returns at most eight normalized results. It has a local
  thirty-requests-per-minute-per-IP guard for the MVP deployment.
- `GET /locations/:placeId` resolves an autocomplete result into a normalized
  `placeId`, `formattedAddress`, latitude, and longitude.
- `POST /routes/preview` accepts ordered Geoapify place IDs and returns resolved
  stops, distance in kilometres, duration in minutes, geometry, and provider.

## Boundary

The route preview is server-calculated and preserves the caller's stop order.
It is not a booking reservation or an accepted booking quote. The booking flow
continues to use the deterministic pricing fallback until a follow-up binds
route evidence to quote issuance and replaces the temporary `0.00` pricing
distance behavior.
