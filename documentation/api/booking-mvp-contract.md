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
pricing. The server validates the route shape, active package, and vehicle type
before using the pricing boundary. The response contains PHP amount, duration,
distance, pricing mode, and `resourceAvailability`, which is either `AVAILABLE`
or `REVIEW_REQUIRED`. A preview does not reserve capacity or permit a client to
choose the accepted price.

For Custom Trips, Geoapify supplies the authoritative route distance and
duration used in the quote response and retained as quote evidence. A
successful response includes a server-issued quote ID and a ten-minute expiry.
It does not reserve capacity.

## Customer bookings

- `POST /bookings` accepts `quoteId`, `idempotencyKey`, and the optional
  `requestReviewIfUnavailable` flag. It rechecks availability and consumes the
  unexpired quote once. An available internal vehicle creates the booking at
  `AWAITING_PAYMENT`. When none is available, the customer must send
  `requestReviewIfUnavailable: true`; the booking is then created at
  `BOOKING_REVIEW`. Retrying the same idempotency key returns the original
  booking rather than creating another record.
- `GET /bookings/me?status=&cursor=&limit=` returns a customer-owned page.
  `limit` defaults to 20 and is capped at 50.
- `GET /bookings/:bookingId` returns only a booking owned by the caller. A
  cross-customer ID returns `404`.
- `POST /bookings/:bookingId/review-decision` accepts `APPROVE` or `REJECT`.
  Approval requires recorded outsourced details and moves the booking to
  `AWAITING_PAYMENT`; rejection moves it to `CANCELLED`.

## Staff booking review

- `GET /staff/booking-reviews` lists bookings currently in `BOOKING_REVIEW`.
- `GET /staff/booking-reviews/:bookingId` returns the review details.
- `PUT /staff/booking-reviews/:bookingId/outsourced-details` records or replaces
  the external provider, vehicle, driver, contact, and agreed cost. It does not
  create company `Vehicle`, `Driver`, `Staff`, or `BookingAssignment` records.
- `POST /staff/booking-reviews/:bookingId/reject` marks a review `REJECTED` when
  staff cannot secure a suitable external resource.

The customer response exposes the outsourced driver and vehicle details but
does not expose the business's agreed outsourcing cost. Review decisions and
staff rejection are recorded in `BookingTransition`; relevant users receive
in-application booking notifications.

Booking, payment, assignment, cancellation, and refund states are separate
response fields. A quote is not a payment, reservation, assignment, or trip
confirmation.
