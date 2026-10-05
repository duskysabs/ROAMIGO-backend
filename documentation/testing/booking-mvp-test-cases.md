# Booking MVP test cases

This is the living verification checklist for the booking MVP. Update the
status beside a case when its automated test, manual verification, or external
dependency changes. A planned case is not evidence that the behavior works.

## Test data and roles

Use a non-production Supabase project and redacted fixture data.

| Actor | Required setup |
| --- | --- |
| Customer | Supabase Auth user with an active `CUSTOMER` profile |
| Administrator | Supabase Auth user with an active `ADMIN` profile and linked Staff record |
| Staff | Active `STAFF` profile |
| Fleet resource | Active Staff, available Driver, available Vehicle, and matching Vehicle Type |

## Authentication and profiles

| ID | Scenario | Expected result | Current evidence |
| --- | --- | --- | --- |
| AUTH-01 | New authenticated user completes their profile | Creates only an active Customer profile | Automated E2E coverage |
| AUTH-02 | Existing-profile user calls profile completion | Request is rejected without replacing the profile | Automated unit coverage |
| AUTH-03 | Anonymous caller completes a profile | `401 Unauthorized` | Automated E2E coverage |
| AUTH-04 | Demo Administrator bootstrap | Creates or updates the configured Admin and Staff records only in non-production | Manual runbook |

## Migration and database baseline

| ID | Scenario | Expected result | Current evidence |
| --- | --- | --- | --- |
| DB-01 | Check Prisma migration history | `pnpm prisma migrate status` reports the database is up to date | Manually verified on 2026-10-04 |
| DB-02 | Existing `user_profile` and Supabase Auth relation after booking migration | Existing profile and Auth data remain usable | Manual verification required after data changes |
| DB-03 | Booking-domain table and constraint presence | Public booking tables, indexes, enums, and foreign keys match `schema.prisma` | Migration applied, representative SQL checks still recommended |

## Tour-package catalog

| ID | Scenario | Expected result | Current evidence |
| --- | --- | --- | --- |
| CAT-01 | Admin creates a package | Package is created as `INACTIVE`; stop sequence is server assigned | Automated unit coverage |
| CAT-02 | Admin submits malformed stops | Reject unless one `PICKUP` is first and one `DROPOFF` is last | Automated unit coverage, rerun after PR #38 test assertion fix |
| CAT-03 | Admin replaces stops | Stops are replaced atomically and preserve sequential order | Automated unit coverage |
| CAT-04 | Admin updates a missing package | `404 Not Found` and no update occurs | Automated unit coverage |
| CAT-05 | Admin activates or deactivates a package | Status changes without altering existing booking stop snapshots | Manual API verification required |
| CAT-06 | Public catalog read | Returns active packages only | Manual API verification required |
| CAT-07 | Staff catalog read | Admin and Staff can read operational package data; Customer cannot access staff route | Manual authorization verification required |
| CAT-08 | Customer booking created from a package, then package changes | Booking retains its copied route stops | Existing booking-service unit coverage; database integration required |

## Customer booking submission

| ID | Scenario | Expected result | Current evidence |
| --- | --- | --- | --- |
| BKG-01 | Customer lists own bookings | Only bookings owned by the authenticated customer are returned | Automated unit coverage |
| BKG-02 | Customer reads another customer's booking ID | `404 Not Found` | Automated unit coverage |
| BKG-03 | Custom route validation | Exactly one pickup and one drop-off, in valid order | Automated unit coverage |
| BKG-04 | Package booking with inactive or incomplete package | Request is rejected | Automated unit coverage |
| BKG-05 | No matching available driver and vehicle | Request is rejected and no booking is created | Automated unit coverage |
| BKG-06 | Customer requests a quote | Server stores a validated snapshot, returns a quote ID, and expires it after ten minutes without reserving capacity | Automated unit coverage required |
| BKG-07 | Customer submits a valid quote | Atomically claims one unexpired quote, creates `AWAITING_PAYMENT`, and records the initial transition | Automated unit coverage with mocked persistence |
| BKG-08 | Customer retries a submission with the same idempotency key | Returns the original booking without consuming another quote or creating a duplicate | Automated unit coverage |
| BKG-09 | Customer submits an expired, consumed, or other-customer quote | Request is rejected without a booking | Automated unit coverage |
| BKG-10 | Real MVP booking request | Uses one active effective Admin configuration and persists `AWAITING_PAYMENT` with calculation and transition evidence | Manual API verification required |

## Deferred workflow boundaries

| ID | Scenario | Expected result | Status |
| --- | --- | --- | --- |
| PAY-01 | Payment intent or verified manual payment | Payment is recorded and booking may advance only after verification | Not implemented |
| ASN-01 | Post-payment assignment | Rechecks availability transactionally and prevents schedule overlaps | Not implemented |
| GEO-01 | Geoapify route-backed booking quote | Server resolves ordered place IDs, persists the provider route evidence, and does not issue a quote if routing fails | Automated unit coverage for quote binding, live provider check required when enabled |
| GEO-02 | Location autocomplete and place resolution | Server returns normalized locations without exposing the provider key | Automated service coverage, live provider check required when enabled |
| GEO-03 | Ordered route preview | Server resolves place IDs in supplied order and returns provider distance, duration, and geometry | Automated service coverage, live provider check required when enabled |
| AUD-01 | Master-data change audit | Actor, timestamp, reason, and before/after values persist | Requires schema work |
| VHC-01 | Admin-defined vehicle classification | New type is customer-selectable without a code deployment | Blocked by fixed `VehicleTypeName` enum |

## Suggested verification order

1. Run focused unit tests for the changed module.
2. Run lint and build.
3. Confirm migration status against the approved non-production Supabase project.
4. Create an Admin, package, stops, active fleet resource, and Customer fixture.
5. Exercise catalog authorization and active-package filtering.
6. After #31, run the real booking submission case and record the booking ID,
   status, route snapshot, and quoted amount with sensitive data removed.

## Recording results

For each manual run, add the date, environment name, case ID, result, and a
redacted request/response or screenshot in the pull request or issue. Never
put access tokens, connection strings, real customer data, or payment details
in this document.
