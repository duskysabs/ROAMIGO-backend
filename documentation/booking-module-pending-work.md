# Booking Module: Pending Work

**Current-state review:** November 8, 2026

This module establishes the booking-foundation schema, durable quote flow, and
customer booking API. Submission remains payment-independent. Separate payment
and assignment modules now extend it through verified manual full payment and
initial internal allocation. See [the payment contract](./api/manual-payments-and-assignment.md).

## Required before production use

| Priority | Work item | Reason it remains pending |
| --- | --- | --- |
| Blocker | Reconcile and verify the squashed Prisma migration baseline against the approved non-production database. | The repository now contains `000000000000_squashed_migrations`; the last recorded database verification predates that squash, so current migration history and representative schema checks must be recorded before another deployment. |
| Later phase | Integrate the external ML pricing service with guardrails. | Admin-managed deterministic pricing is implemented; FastAPI remains #15 and is not required for the manual-payment slice. |
| Optional provider | Implement PayMongo checkout and signed webhook verification if selected. | Manual payment is the approved first path. Personal onboarding and enabled live capabilities are external account decisions. |
| High | Complete the broader payment workflow in #16. | Staff-recorded receipts, review, audit and a durable allocation request exist. Customer proof storage, deadlines and provider automation remain. |
| High | Complete assignment lifecycle and recovery in #17/#25. | Initial internal allocation and paid-awaiting-assignment recovery requests exist. Replacement history, complete turnaround/document policies and external fulfilment remain. |
| High | Apply and verify the new overlap and payment migrations in an isolated database. | Exclusion constraints and resource guards are authored, not executed or proven in this review. |
| High | Run the new local Postgres suite and extend integration coverage. | Manual-payment concurrency cases are authored but not run; hosted/provider and full booking integration remain unverified. |
| Medium | Add customer cancellation, refund, receivables, and travel-slip workflows. | These ERD entities are modeled but do not yet expose complete business APIs. |
| Medium | Add temporary outsourced-driver accounts and booking-scoped operational access. | The review workflow records external resources, but account invitation, trip actions, expiry, and revocation are intentionally deferred. |
| Medium | Extend the living manual/API test matrix for later payment, assignment, cancellation, and trip workflows. | The current checklist covers the payment-independent MVP; later workflows need cases after their final behavior is defined. |

## Current source implementation

The payment-independent source includes route-backed quotes, deterministic
pricing, single-use quote submission, customer-owned reads, Booking Review,
Staff-recorded outsourced details, customer decisions, transition evidence,
and a limited in-application notification subset.

Initial manual payment and assignment APIs, immutable payment audits and a
durable retry queue are also implemented. Tests and migrations for November 8
were not run.

On October 27, 2026, the then-current source passed the build, lint, 63 unit tests,
and 21 HTTP-level tests. The HTTP-level suite uses mocked application boundaries;
it does not replace an isolated real-database integration suite.

## Current lifecycle boundary

`POST /bookings/quote` validates the customer request, checks internal vehicle
readiness, and creates a server-owned quote that expires after ten minutes. Its
response reports `AVAILABLE` or `REVIEW_REQUIRED`; neither result reserves a
resource. `POST /bookings` accepts the quote ID, a customer-supplied idempotency
key, and an optional review opt-in. It rechecks availability and atomically
claims the quote. Available requests enter `AWAITING_PAYMENT`; opted-in
unavailable requests enter `BOOKING_REVIEW`. It creates no payment,
reservation, or assignment.

## Deterministic pricing MVP boundary

The MVP pricing gateway selects exactly one active, effective Admin pricing
configuration for the requested vehicle type. Custom trips use that fixed PHP
rate. Tour packages use the stored package base price plus that fixed vehicle
rate. The booking stores the selected configuration and calculation snapshot in
the same transaction, so later price changes do not rewrite accepted bookings.

This is a demo fallback, not dynamic route-priced pricing. For Custom Trips,
Geoapify now supplies the authoritative route distance and duration retained
with the quote, while the Admin-controlled fixed price remains the amount
shown to the customer. FastAPI RFR remains later work. Manual full-payment
confirmation is implemented in the separate PaymentsModule.

## Quote and lifecycle boundary

The durable quote stores the validated request snapshot, price evidence, and
for Custom Trips the server-resolved Geoapify route evidence, so the customer
cannot submit a client-modified amount or route after reviewing a quote. A
quote is consumed at most once and is bound to the created booking.
The submission transaction records the initial `DRAFT` to either
`AWAITING_PAYMENT` or `BOOKING_REVIEW`. This is lifecycle evidence for the demo
flow, not the complete transition policy. Booking Review covers the customer
request, Staff outsourcing record, customer decision, Staff rejection,
transition evidence, and in-application notification subset. Manual payment
confirmation and initial internal assignment now have separate authorized
workflows and audit evidence. Generalized transition policy, cancellation and
temporary outsourced-driver access remain.

## Master-data API boundary

The tour-package module owns package records and ordered stops. Administrators
create packages inactive, then explicitly activate them after review. Public
catalog reads return only active packages, while Staff and Administrators can
read the operational catalog. Replacing a package route is atomic and does not
rewrite booking stop snapshots.

`VehicleType.vehicleType` remains a fixed database enum. Records can use only
supported values; a complete Admin vehicle-type management API is not exposed.
Arbitrary classifications need a reviewed schema migration. Durable administrative
audit history and a vehicle-type active lifecycle also need schema support;
they must not be represented by application-only placeholder behavior.

## Fleet-readiness MVP boundary

The fleet module owns Staff/Admin list, readiness-status, designated-driver,
and availability endpoints. Its availability result uses the same advisory
capacity, active-employment, status, designated-pair, and schedule checks as
booking submission. It does not reserve a vehicle or driver. The separate
post-payment assignment module reserves intervals using database exclusion
constraints; actual migration and concurrency verification remain pending.
