# Booking MVP demo setup and rehearsal

This runbook prepares the non-production facts required for the customer
booking demonstration. It is intentionally repeatable and uses only synthetic
identities and records. The demonstrated terminal state is
`AWAITING_PAYMENT`.

## Safety boundary

- Use only the approved non-production Supabase project and local environment.
- Never commit `.env` files, passwords, access tokens, API keys, database URLs,
  real customer data, or real vehicle details.
- `pnpm demo:setup-booking` refuses `NODE_ENV=production` and requires an
  explicit local opt-in.
- The setup command creates application records only. Supabase Auth users must
  already exist, so the script cannot silently create privileged credentials.
- Existing records with the explicit `DEMO` package name or configured demo
  plate are refreshed. Do not reuse those identifiers for ordinary testing.

## Prerequisites

1. Apply and verify the approved database migrations.

   ```bash
   pnpm prisma migrate status
   ```

2. Create three synthetic Supabase Auth users in the non-production project:
   an Administrator, a Customer, and a Driver.

3. Bootstrap the Administrator through the approved command in
   [demo-account-bootstrap.md](../authentication/demo-account-bootstrap.md).

4. Authenticate as the Customer and call `POST /user-profiles/me/complete`.
   The Customer must have an active `CUSTOMER` profile before booking data is
   prepared.

5. Configure Geoapify for the non-production backend. The setup command
   validates the provider route before it writes demo records, so a disabled
   provider, missing key, or stale place ID stops the rehearsal early.

## Setup

Set these values only in a local, untracked environment file:

```text
ALLOW_DEMO_BOOKING_SETUP=true
DEMO_ADMIN_USER_ID=<existing active Admin UUID>
DEMO_CUSTOMER_USER_ID=<existing active Customer UUID>
DEMO_DRIVER_USER_ID=<existing Supabase Auth user UUID>
DEMO_DRIVER_FIRST_NAME=Demo
DEMO_DRIVER_LAST_NAME=Driver
DEMO_DRIVER_LICENSE_NUMBER=<synthetic unique licence value>
DEMO_VEHICLE_PLATE_NUMBER=<synthetic unique plate value>
DEMO_CUSTOM_TRIP_PLACE_IDS=<pickup-place-id>,<dropoff-place-id>
GEOAPIFY_ENABLED=true
GEOAPIFY_API_KEY=<server-side non-production key>
```

Then run:

```bash
pnpm demo:setup-booking
```

The command verifies the Admin and Customer profiles, then creates or restores:

- one `VAN` vehicle type;
- one active available synthetic vehicle with capacity eight;
- one active synthetic Staff/Driver, designated to that vehicle;
- the active `DEMO Booking Flow Package` with a server-owned ordered route;
- exactly one active `VAN` deterministic pricing configuration owned by the
  configured Admin.

The command resolves and routes the configured synthetic place IDs before it
creates or updates database records. It prints the fixture identifiers,
resolved synthetic stops, provider, expected distance, and expected duration
required for the rehearsal. It fails rather than modifying a conflicting
active VAN pricing configuration or pretending routing is available.

## Expected pricing

| Scenario | Expected amount | Distance | Duration |
| --- | ---: | ---: | --- |
| Custom Trip | PHP 1200.00 | Geoapify distance printed by setup | Geoapify duration printed by setup |
| Tour Package | PHP 3700.00 | `0.00` km | 180 minutes |

The deterministic Admin price remains the amount shown for the Custom Trip.
Geoapify provides route distance and duration as quote evidence, but it does
not yet change the fixed demo price.

## Postman environment

Use a local Postman environment with these variables. Do not export a real
access token, API key, or database URL with the collection.

| Variable | Source |
| --- | --- |
| `baseUrl` | Non-production NestJS base URL, for example `http://localhost:3000` |
| `customerAccessToken` | Synthetic Customer login response |
| `vehicleTypeId` | Setup command output |
| `pickupPlaceId` | First setup command `customTrip.placeIds` value |
| `dropoffPlaceId` | Last setup command `customTrip.placeIds` value |
| `expectedRouteDistanceKm` | Setup command output |
| `expectedRouteDurationMinutes` | Setup command output |
| `quoteId` | Quote response, set only for the current rehearsal |
| `idempotencyKey` | A fresh unique value for each rehearsal |

Before setup, use `GET {{baseUrl}}/locations/autocomplete?text=<synthetic
location text>` to obtain valid non-production place IDs. Store the chosen
pickup and drop-off IDs in `DEMO_CUSTOM_TRIP_PLACE_IDS` before running the
setup command. The returned normalized locations must be synthetic demo
locations, never a customer's address.

## Rehearsal: happy path

1. Sign in as the prepared Customer and retain the access token only in the
   API client session.
2. Confirm catalog data:

   ```text
   GET /booking-options/vehicle-types
   GET /tour-packages
   ```

3. Send `POST {{baseUrl}}/bookings/quote` with
   `Authorization: Bearer {{customerAccessToken}}`, the printed
   `vehicleTypeId`, a future two-hour interval, two passengers, and the
   `placeIds` printed by setup. Do not send client-generated addresses,
   coordinates, distance, duration, or price.

   ```json
   {
     "vehicleTypeId": "<printed VAN vehicle type UUID>",
     "bookingType": "CUSTOM_TRIP",
     "startDatetime": "<future ISO timestamp>",
     "endDatetime": "<later future ISO timestamp>",
     "passengerCount": 2,
     "routePlaceIds": ["<printed pickup place ID>", "<printed dropoff place ID>"]
   }
   ```

4. Confirm the response returns a `quoteId`, `expiresAt`, `PHP`, `1200.00`,
   and the distance and duration printed by setup.

   Save the response `quoteId` to the Postman `quoteId` variable. A Postman
   test may also assert that `totalDistanceKm` equals
   `{{expectedRouteDistanceKm}}` and `estimatedDurationMinutes` equals
   `{{expectedRouteDurationMinutes}}`.
5. Within ten minutes, send `POST {{baseUrl}}/bookings` with
   `Authorization: Bearer {{customerAccessToken}}`:

   ```json
   {
     "quoteId": "<server-issued quote UUID>",
     "idempotencyKey": "demo-rehearsal-<unique value>"
   }
   ```

6. Confirm `POST /bookings` returns `AWAITING_PAYMENT`, the stored price, and
   copied stops. Do not describe this as payment, confirmation, reservation, or
   assignment.
7. Repeat the exact submission. Confirm the original booking is returned and
   no second booking is created.
8. Confirm the booking is visible only to the Customer through
   `GET /bookings/me` and `GET /bookings/:bookingId`.

## Rehearsal: expected failure

Request a quote with the end time before the start time. Confirm the server
returns the validation error and does not return a quote or create a booking.

Optionally, wait for a quote to expire and submit it. Confirm the server
returns the stable expired, consumed, or unavailable quote error without a
booking.

## Reset and repeat

Run `pnpm demo:setup-booking` again to restore the selected synthetic vehicle,
Driver, package route, and pricing configuration to the known demo state. Use
a fresh future schedule and idempotency key for every rehearsal. Historical
bookings and transition evidence are retained deliberately; do not delete them
manually from a shared database.

If the command reports a conflicting active VAN configuration, deactivate or
adjust that non-demo configuration through the Admin pricing API, then rerun
the command. Do not use a broad Prisma schema reset or change records in a
production environment.

## Evidence to record

Record the date, environment name, case ID, result, and redacted request and
response evidence in the pull request or issue:

- catalog response;
- quote response with expiry and price;
- booking response at `AWAITING_PAYMENT`;
- idempotent retry response;
- expected invalid-schedule or expired-quote response;
- known limitation that the deterministic Admin price does not yet vary with
  route distance or duration.

## Recorded non-production rehearsal

**Date:** October 5, 2026

- The route-evidence migration was applied and Prisma reported the database
  schema up to date.
- The synthetic demo setup resolved the configured Geoapify route successfully
  and reported 9.25 km with an estimated duration of 13 minutes at setup time.
- A Custom Trip quote returned PHP 1200.00, route metrics from Geoapify, and a
  ten-minute expiry. Its accepted booking was stored as `AWAITING_PAYMENT`.
- A Tour Package quote returned PHP 3700.00, 180 minutes, and copied the three
  approved package stops into an `AWAITING_PAYMENT` booking.
- The customer booking list and detail endpoints returned only server-owned
  status, pricing, and stop data.
- The idempotency retry returned the original booking rather than creating a
  duplicate.
- Invalid schedule, unsupported passenger capacity, client price injection,
  expired quote, and cross-customer detail access each returned the expected
  rejection response.

This evidence applies only to the non-production rehearsal. It does not prove
payment, reservation, assignment, dispatch, or production readiness.
