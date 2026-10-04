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

The command prints the redacted fixture identifiers required for requests. It
fails rather than modifying a conflicting active VAN pricing configuration.

## Expected pricing

| Scenario | Expected amount | Distance | Duration |
| --- | ---: | ---: | --- |
| Custom Trip | PHP 1200.00 | `0.00` km | Request schedule duration |
| Tour Package | PHP 3700.00 | `0.00` km | 180 minutes |

The zero distance is the deliberate deterministic-price fallback. Geoapify is
not yet integrated, so do not claim these coordinates represent a calculated
route or provider-confirmed travel time.

## Rehearsal: happy path

1. Sign in as the prepared Customer and retain the access token only in the
   API client session.
2. Confirm catalog data:

   ```text
   GET /booking-options/vehicle-types
   GET /tour-packages
   ```

3. Request a Custom Trip quote with the printed `vehicleTypeId`, a future
   two-hour interval, two passengers, and a Pickup then Dropoff route. Use
   synthetic labels and coordinates from the `DEMO` package, not real customer
   locations.
4. Confirm the response returns a `quoteId`, `expiresAt`, `PHP`, `1200.00`,
   and `0.00` distance.
5. Submit the quote within ten minutes:

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
- known limitation that routing is not Geoapify-backed yet.
