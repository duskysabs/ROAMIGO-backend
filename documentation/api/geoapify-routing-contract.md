# Location and routing API contract

The backend owns Geoapify communication. Clients never receive the Geoapify API
key and should use normalized ROAMIGO location objects instead of provider
payloads.

## Configuration

Set `GEOAPIFY_ENABLED=true` and `GEOAPIFY_API_KEY=<server-side key>` only in an
approved non-production or production environment. The enabled flag must be
exactly true or false after trimming (omitted defaults to false). Startup fails
when enabled without a usable key; configuration errors never echo the value.
GEOAPIFY_TIMEOUT_MS defaults to 8000 and must be an integer from 1000 to 30000.
When disabled, location and route endpoints return a stable
service-unavailable response instead of pretending that route data is valid.

## Endpoints

- `GET /locations/autocomplete?text=&biasLat=&biasLon=` requires at least three
  trimmed text characters (maximum 200) and returns at most eight normalized
  results. Bias latitude/longitude must be supplied together and be in range.
- `GET /locations/:placeId` resolves an autocomplete result into a normalized
  `placeId`, `formattedAddress`, latitude, and longitude.
- `POST /routes/preview` accepts 2 to 10 ordered, nonblank Geoapify place IDs
  (maximum 500 characters each) and returns resolved
  stops, distance in kilometres, duration in minutes, geometry, and provider.

## Boundary

The route preview is server-calculated and preserves the caller's stop order.
It is not a booking reservation or an accepted booking quote. Custom Trip
quote issuance reuses this boundary and persists the resolved Geoapify route
as quote evidence. The deterministic pricing fallback remains fixed-price, so
route metrics do not yet alter the customer-facing amount.

## Failure and abuse boundaries

All public location and route-preview endpoints share a fixed 30-request,
60-second budget per request.ip per application process. They return 429 with
LOCATION_RATE_LIMITED, retryable=true and Retry-After seconds when exhausted.
The limiter retains at most 5000 client windows. At capacity it prunes expired
entries and rejects new identities instead of evicting active limits. Cache
Control is no-store for these guarded endpoints. Raw forwarded headers are not
trusted independently of Express proxy configuration. Behind a proxy, review
that configuration explicitly; requests sharing the same visible IP share a
budget. Multi-instance quotas require an approved shared/gateway limiter.

This is an HTTP-entry budget, not a provider-credit counter: one route preview
can perform multiple place resolutions. Internal authenticated booking quotes
reuse the bounded RoutingService/GeoapifyClient boundary but do not enter the
public controller limiter. No distributed or global provider-quota claim is made.

The adapter requires finite in-range coordinates and nonnegative route metrics,
plus valid LineString/MultiLineString geometry. Missing or malformed result
collections fail closed; a genuine empty autocomplete array remains successful.
Provider fields other than the normalized location/route data are not returned.
Redirects are rejected to avoid forwarding a credential-bearing request elsewhere.

Provider failures use a stable body with statusCode, code, message and retryable:

| Code | HTTP | Retryable |
| --- | --- | --- |
| GEOAPIFY_NOT_CONFIGURED | 503 | false |
| GEOAPIFY_TIMEOUT | 503 | true |
| GEOAPIFY_UNAVAILABLE | 503 | true |
| GEOAPIFY_RATE_LIMITED | 503 | true |
| GEOAPIFY_REJECTED | 502 | false |
| GEOAPIFY_INVALID_RESPONSE | 502 | false |

Invalid transport DTOs return the existing NestJS 400 validation response.
Invalid direct adapter/route-service input uses LOCATION_INPUT_INVALID (400).
Errors never include provider bodies, URLs, keys or raw exception messages.
Dependent routing, pricing and booking execution must fail rather than invent
coordinates, distance, duration or a successful quote.

## Safe metric events

Each adapter operation emits a structured geoapify.request log containing only
operation, outcome category and durationMs. Counts/failure ratios and latency
can be aggregated from these events by the deployment's logging system. No
search text, place IDs, coordinates, addresses, IPs, request URLs, provider
responses or credentials are emitted. This PR does not provision a monitoring
service, add a public metrics endpoint or modify the existing monitoring setup.

## Verification for issue #12

Authored adapter tests cover configuration, normal/empty/malformed payloads,
result limits, coordinate/geometry/metric validation, redirects, safe errors and
telemetry. Service tests cover order and failure propagation. A real Nest HTTP
suite uses a stub fetch provider (no network) for normalization, coordinate pairs,
route bounds, shared rate limits and provider failure contracts. Limiter tests
cover window expiry and bounded tracking under many identities.

Tests, lint, build and live provider checks have not been run for this change.
No database migration is required. From work/issue12-geoapify-hardening:

```bash
npm test -- test/unit/geoapify.client.spec.ts test/unit/location-rate-limit.spec.ts test/unit/location-routing.service.spec.ts
npm run test:e2e -- test/e2e/geoapify-routing.e2e-spec.ts
npm run lint
npm run build
```

Previous successful non-production location/route rehearsal is historical
evidence, not a pass for this adapter change. Live provider calls remain outside
the default suites and require an authorized server key/environment. Keep #12
open until user-run checks and review establish its remaining criteria.
