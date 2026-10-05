# Booking MVP API contract

## Customer catalog

- `GET /booking-options/vehicle-types` returns customer-selectable vehicle type
  IDs, names, and maximum available capacity. It never exposes vehicle plates,
  Driver records, or operational fleet status.
- `GET /tour-packages` returns active packages only.
- `GET /tour-packages/:tourPackageId` returns one active package or `404`.
  Stops are ordered and server-authoritative.

## Quote preview

`POST /bookings/quote` accepts the schedule and booking inputs. Custom Trips
submit ordered Geoapify place IDs, which the server resolves and routes before
pricing. The server validates the route shape, active package, vehicle type,
and advisory fleet eligibility before using the pricing boundary. The response
contains PHP amount, duration, distance, and pricing mode. A preview does not
reserve capacity or permit a client to choose the accepted price.

For Custom Trips, Geoapify supplies the authoritative route distance and
duration used in the quote response and retained as quote evidence. A
successful response includes a server-issued quote ID and a ten-minute expiry.
It does not reserve capacity.

## Customer bookings

- `POST /bookings` accepts only `quoteId` and `idempotencyKey`. It rechecks
  availability, consumes the unexpired quote once, and creates a booking at
  `AWAITING_PAYMENT`. Retrying the same idempotency key returns the original
  booking rather than creating another record.
- `GET /bookings/me?status=&cursor=&limit=` returns a customer-owned page.
  `limit` defaults to 20 and is capped at 50.
- `GET /bookings/:bookingId` returns only a booking owned by the caller. A
  cross-customer ID returns `404`.

Booking, payment, assignment, cancellation, and refund states are separate
response fields. A quote is not a payment, reservation, assignment, or trip
confirmation.
