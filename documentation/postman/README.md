# ROAMIGO Postman Collections

## Complete backend suite

Import these two files into a current Postman Desktop version:

1. `ROAMIGO-all-endpoints.postman_collection.json`
2. `ROAMIGO-all-endpoints.local.postman_environment.json`

Select **ROAMIGO Complete API: Local**. Set `baseUrl` to the running backend,
then enter the `admin`, `staff`, `customer` and `driver` email/password variables
locally. Staff must be active and not linked to a Driver. The Driver account is
an active Staff account linked to a Driver record. An Administrator account must
already exist. Alternatively, provide the corresponding `*Token` variables and
leave login credentials blank; the identity requests capture the user IDs.
Never commit populated environments or tokens. These exports contain no secrets
and do not import the backend `.env` file.

The suite contains 70 current endpoints, 159 request templates and 61 individual
missing-auth checks. [The coverage inventory](all-endpoints-coverage.md) maps each
endpoint to its controller and request folder. Assertions check exact HTTP codes,
response shapes, ownership, payment states and Driver transitions. This is
authored coverage, not a report of successful API execution.

### First run

1. Start the backend separately and choose an isolated test database/account set.
2. Run folder `00` to initialize captured IDs, log in and verify each identity.
   The first request clears captured workflow IDs, so do not rerun it while
   continuing an existing booking. Configured credentials and fleet fixture IDs
   are retained.
3. Keep `runWrites=false` initially. Use public/catalog reads, your role reads and
   folder `14` for missing-auth checks. Missing tokens, IDs or scenarios are
   explicitly skipped, not counted as successful requests. Review skips in the
   Postman Console as well as the Runner results.
4. For a complete main journey, set `runWrites=true`, `scenario=main`, and run
   folders `02` through `10` in order. Run only the relevant folders when
   continuing an existing journey. These requests create and update real records
   in the configured target.
5. Run folder `15` for role, ownership and validation denials. The signup
   validation case requires the separate `auth-validation` scenario.

Use the Collection Runner or send individual requests. Login and signup share a
limit of five attempts per client per minute, including successful attempts.
Leave optional `otherCustomerEmail` blank during the initial four-role login plus
scratch employee signup. To test ownership, log in the second Customer later or
provide `otherCustomerToken`, then run its identity request. Run onboarding and
invalid signup separately after the rate window resets. If HTTP 429 occurs,
respect `Retry-After` and reuse captured tokens instead of repeatedly logging in.
An unexpected 429 is a failed request, not an accepted positive result.

### Main journey prerequisites

- An existing vehicle type, active pricing covering the requested period, an
  active tour package, and an eligible available Driver/vehicle pair are needed.
  Catalog reads capture type/package IDs when blank; set explicit IDs for
  deterministic fixtures. There is no VehicleType creation endpoint.
- Scratch Staff creation needs a unique `newStaffEmail`/`newStaffPassword`, or an
  existing unprofiled Auth identity in `staffAuthUserId`. Scratch Driver and
  vehicle requests use that new Staff record. They return the scratch pair to
  unavailable after probing readiness. They do not prepare the primary Driver.
  Retained Staff/Driver identities cannot be recreated on a second run.
- Main booking uses a tour-package quote and its exact server price. Payment is
  recorded and verified in full before allocation. It does not call PayMongo.
- Automatic allocation must select the logged-in Driver. Prefer a sole eligible
  test pair. Otherwise, sign in as the selected Driver and rerun its identity
  requests, or supply an assignment belonging to that Driver and run folder `10`
  separately. The suite never substitutes an unrelated assignment automatically.
- Default dates start one minute before initialization and end two hours later
  to allow immediate trip-start testing. Set explicit ISO dates when needed and
  clear old dates between new runs. The backend must have pricing for that period.
- Geoapify requests require `runProviderCalls=true`, configured backend provider
  access and valid place IDs. They are independent of the tour-package journey.

### Alternative scenarios

Set `scenario` to one value and run the named folder or requests. Keep
`runWrites=true` for mutations. Terminal alternatives need separate records.

| Scenario | Folder and prerequisites |
| --- | --- |
| `onboarding` | `01`: unique `signupEmail`/`signupPassword`. If email confirmation is required, confirm it outside Postman before the login/profile requests. |
| `pricing` | `06` pricing requests only: `vehicleTypeId`, `pricingEffectiveFrom`, `pricingEffectiveUntil`. Choose a non-overlapping period; existing active pricing is never automatically disabled. |
| `review-approve` | `11`: `reviewVehicleTypeId`, `reviewPassengerCount`, package and dates. Use a type with enough capacity but no available pair. Quote must return `REVIEW_REQUIRED`. Staff offers outsourcing, then Customer approves. |
| `review-customer-reject` | `11`: same fresh review setup, followed by Customer rejection. |
| `review-staff-reject` | `11`: same fresh review setup, followed by Staff rejection. |
| `payment-reject` | `12`: a separate pending receipt in `rejectPaymentId`. |
| `driver-decline` | `12`: a separate unanswered assignment owned by the logged-in Driver in `declineAssignmentId`. |
| `retry` | Allocation retry request: `retryBookingId` identifies a fully paid booking awaiting allocation. |
| `expiry` | `12`: genuinely overdue unanswered assignments. A zero-processed response checks the endpoint contract but does not prove deadline expiry. Default response window is two hours. |
| `auth-validation` | `15`: invalid signup body, run outside the login/signup rate window. |
| `cleanup` | `13`: only captured scratch Driver, vehicle and package IDs. Driver is deactivated, vehicle soft-deleted and package deactivated. |

No endpoint exists to delete bookings or Auth users, refund payments or release
general turnaround holds. Completed trips retain their holds. Cleanup does not
undo bookings/payments or bypass those restrictions. The review scenarios do not
disable the existing fleet to force unavailability.

### Verification status

The route inventory, export JSON and embedded script syntax were inspected.
Backend tests, build, lint, type checking and live Postman/API execution: **not
run**. Run the scenarios against your configured backend and inspect both failed
and skipped requests before treating an endpoint as verified.

The exports use the [Postman collection v2.1 format](https://schema.postman.com/)
and [`pm.execution.skipRequest`](https://learning.postman.com/latest-v-12/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution).
Use a current Desktop/Runner version with this API. Older runners may reject
the prerequisite scripts; they should not silently send requests with missing
fixtures.

## Legacy focused suites

Import both files into Postman:

1. `ROAMIGO-local.postman_environment.json`
2. `ROAMIGO-booking-review.postman_collection.json`
3. `ROAMIGO-fleet-management.postman_collection.json`
4. `ROAMIGO-staff-administration.postman_collection.json`

Select the imported environment and fill in the Customer and Staff/Admin
credentials locally. Do not commit populated credentials or access tokens.

Run folders 01 through 05 for the approval path. Customer rejection and Staff
rejection are alternative terminal paths and require a newly generated review
booking.

The collection selects the largest vehicle for the chosen vehicle type and
marks it unavailable. If another vehicle can satisfy the same passenger count,
repeat the unavailable-status request for that vehicle before generating the
quote. The quote test must return resourceAvailability: REVIEW_REQUIRED.

Always run the cleanup request for every vehicle whose status was changed.
Database-backed execution still requires access to the configured Postgres and
Supabase services.

## Fleet management

The fleet collection requires Administrator credentials in the `staffEmail`
and `staffPassword` variables. Set `driverStaffId` to an existing active Staff
record that does not yet have a Driver record. The collection creates a unique
licence number and vehicle plate, creates the Driver and vehicle, pairs them,
makes the pair available, exercises fleet reads, and then deactivates the
Driver and soft-deletes the vehicle.

Because Driver records are retained for history, the same `driverStaffId`
cannot be used for a second complete run. Use another Staff record for each
onboarding run. If the vehicle-type discovery request returns no records, set
`vehicleTypeId` manually from an existing `vehicle_type` row.

## Staff administration

The Staff Administration collection uses `staffEmail` and `staffPassword` for
an existing Administrator account. Set `newStaffEmail` and `newStaffPassword`
to unused prospective-employee credentials. The collection signs up that Auth
user, captures `newStaffUserId`, and creates the Staff profile without manual
Supabase table insertion.

If Supabase email confirmation is enabled, the employee must confirm the email
before logging in, but the Administrator may still create the Staff profile
from the signup response's user ID. The main workflow ends by reactivating the
Staff record. The final deactivation request is an optional terminal action.
