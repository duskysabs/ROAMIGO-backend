# ROAMIGO ERD Improvement Proposal

**Status:** Draft for team review  
**Date:** October 3, 2026  
**Scope:** Booking domain and directly connected modules  
**Primary reference:** ROAMIGO Capstone Documentation, including the approved ERD, SRS requirements, process models, and role definitions

## 1. Purpose

This proposal identifies improvements to the current Prisma schema while preserving the entities, terminology, business states, and workflows defined in the capstone documentation.

The objective is not to replace the approved ERD. The objective is to make its implementation safe, configurable, traceable, and suitable for the initial booking demonstration and later production work.

The implementation must remain measurably aligned with the documentation. Supporting tables may be added when they improve integrity, history, security, or integration reliability without changing the documented business meaning.

## 2. Architectural principles

1. Preserve documented business entities and terminology.
2. Keep booking, payment, assignment, cancellation, refund, and trip states separate.
3. Preserve historical commercial and operational evidence.
4. Treat external providers as replaceable adapters.
5. Do not trust client-supplied prices, distances, durations, availability, or status changes.
6. Enforce critical concurrency and financial rules at the database level where possible.
7. Use immutable versions for published prices and accepted customer terms.
8. Deactivate business configuration instead of deleting records used by historical transactions.
9. Use explicit module ownership rather than allowing modules to update one another's records directly.
10. Demonstrate only behavior that has actually been implemented and verified.

## 3. Current strengths

The current schema already provides a useful domain foundation:

- Supabase authentication identity is separated from application profiles.
- Customer, Staff, Driver, Vehicle, Tour Package, and Booking records are represented.
- Booking stops preserve ordered route information.
- Pricing configuration and calculation records are separate concepts.
- Booking, payment, assignment, cancellation, refund, receivable, and trip states are represented independently.
- Monetary values use decimal database types.
- Payment provider references have a uniqueness boundary.
- Customer booking ownership is represented directly.
- Operational records generally identify the responsible Staff member.

These structures should be retained where they agree with the approved documentation.

## 4. Priority findings

### 4.1 Vehicle types are not administratively configurable

The current `VehicleTypeName` enum limits vehicle types to values deployed with the application. An Administrator cannot create a genuinely new business vehicle type without changing the Prisma schema and applying a migration.

This conflicts with an Admin-managed catalog if Planet J needs to add, rename, deactivate, or reorganize offerings.

### Recommendation

Preserve the documented `VehicleType` entity, but make its business identity data-driven:

```text
VehicleType
- vehicle_type_id
- code, unique and immutable
- display_name
- description, optional
- default_passenger_capacity, optional
- vehicle_class, optional stable technical enum
- is_active
- created_by_staff_id
- updated_by_staff_id
- created_at
- updated_at
```

An optional broad `vehicle_class` enum may contain stable categories such as `CAR`, `VAN`, and `BUS`. It must not be the Admin-managed display catalog.

Existing bookings and quotes should reference the immutable vehicle-type identifier and retain any customer-visible snapshot needed for history.

### 4.2 Pricing configuration is insufficient for the deterministic demo flow

The existing pricing configuration contains a base rate and adjustment bounds, but it cannot fully describe a transparent Custom Trip calculation. The existing pricing calculation also depends on a booking, although a customer needs a price before creating a booking.

### Recommendation

Preserve `PricingConfiguration`, `FuelPriceRecord`, and `PricingCalculation`, then extend them with versioned publishing behavior.

```text
PricingConfiguration
- pricing_config_id
- version
- booking_type, optional applicability
- vehicle_type_id, optional applicability
- currency
- fixed_fee
- per_kilometer_rate
- per_minute_rate
- minimum_charge
- maximum_charge, optional
- rounding_rule
- status: DRAFT, PUBLISHED, RETIRED
- effective_from
- effective_until, optional
- created_by_staff_id
- published_by_staff_id, optional
- change_reason
- created_at
- updated_at
```

Rules:

- A published version is immutable.
- Changing prices creates a new version.
- Effective periods for the same applicability must not overlap.
- Historical bookings continue to reference the version used when quoted.
- The future FastAPI integration may suggest a price, but NestJS remains responsible for bounds, rounding, currency, fallback selection, and the final customer-facing amount.

### 4.3 A pre-booking quote record is missing

The current flow calculates pricing during booking creation. This collapses quote generation and booking acceptance into one operation and makes expiry, reuse prevention, and historical review difficult.

### Recommendation

Add a supporting `BookingQuote` entity:

```text
BookingQuote
- quote_id
- customer_user_id
- route_snapshot_id
- pricing_config_id
- vehicle_type_id
- tour_package_id, optional
- booking_type
- requested_start_at
- requested_end_at
- passenger_count
- subtotal
- final_amount
- currency
- status: ACTIVE, ACCEPTED, EXPIRED, VOID
- expires_at
- accepted_at, optional
- input_fingerprint
- idempotency_key, optional
- created_at
```

Optional quote-line records may explain fixed, distance, duration, package, fuel, or adjustment components.

A booking must consume an active quote atomically. A quote must be owned by the same customer, unexpired, unused, and consistent with the submitted booking intent.

### 4.4 Geoapify route evidence needs an immutable snapshot

Addresses and coordinates currently flow into booking creation, but the schema does not clearly preserve the authoritative provider result used for pricing.

### Recommendation

Add provider-neutral route records:

```text
RouteSnapshot
- route_snapshot_id
- provider
- provider_request_id, optional
- provider_route_id, optional
- distance_meters
- duration_seconds
- encoded_geometry or geojson, optional
- request_fingerprint
- calculated_at

RouteSnapshotStop
- route_snapshot_stop_id
- route_snapshot_id
- sequence_number
- stop_type
- location_name
- formatted_address
- latitude
- longitude
- planned_stop_minutes, optional
```

Store distance in meters and duration in seconds internally. Convert values for display at the API boundary.

Tour Package stops remain catalog definitions. When a route is quoted, copy the accepted route into a snapshot so later package edits do not rewrite booking history.

### 4.5 Booking lifecycle history is missing

The Booking record stores only the current status. This is insufficient for reconstructing submission, validation, payment waiting, review, confirmation, cancellation, or completion decisions.

### Recommendation

Retain `Booking.booking_status` as the current-state projection and add:

```text
BookingStatusTransition
- booking_status_transition_id
- booking_id
- from_status, optional
- to_status
- reason_code, optional
- note, optional
- actor_type
- actor_user_id, optional
- correlation_id
- occurred_at
```

Add explicit timestamps to Booking where useful:

- `submitted_at`
- `confirmed_at`
- `completed_at`
- `cancelled_at`

The original `submitted_at` must remain immutable because first-come-first-served processing depends on it.

Booking creation should also support a customer-scoped idempotency key and an optimistic concurrency version.

### 4.6 Assignment uniqueness prevents reassignment history

The current unique constraint on `BookingAssignment.booking_id` permits only one assignment row for the lifetime of a booking. This conflicts with assignment statuses such as declined, released, and replaced and with the documented recovery workflow.

### Recommendation

Allow multiple assignment records while enforcing at most one active assignment:

```text
BookingAssignment
- booking_assignment_id
- booking_id
- reservation_id, optional
- vehicle_id
- driver_id
- sequence_number
- assignment_status
- proposed_at
- assigned_at, optional
- acknowledged_at, optional
- declined_at, optional
- released_at, optional
- replaced_by_assignment_id, optional
- reason_code, optional
```

Use a PostgreSQL partial unique index for one active assignment per booking.

### 4.7 Resource overlap protection is missing

Application queries alone cannot prevent concurrent requests from reserving the same Driver or vehicle for overlapping periods.

### Recommendation

Add a resource reservation record:

```text
ResourceReservation
- reservation_id
- booking_id
- vehicle_id
- driver_id
- reserved_from
- reserved_until
- reservation_status: HELD, CONFIRMED, RELEASED, EXPIRED
- hold_expires_at, optional
- released_at, optional
- release_reason, optional
- created_at
```

Use PostgreSQL exclusion constraints for active vehicle and Driver time ranges. Final assignment must recheck availability and create the reservation in one retryable transaction.

Availability shown before payment remains advisory and must not be described as a reservation.

### 4.8 Vehicle and Driver designation history is missing

`Vehicle.assigned_driver_id` records only the current designation. Changing it can rewrite the meaning of earlier availability and assignment decisions.

### Recommendation

Add:

```text
VehicleDriverDesignation
- designation_id
- vehicle_id
- driver_id
- effective_from
- effective_until, optional
- created_by_staff_id
- ended_by_staff_id, optional
- reason
```

Enforce one current designation per vehicle and per Driver where required by business policy. Preserve assignment snapshots independently of later designation changes.

### 4.9 Original and mid-trip route changes are mixed

Adding Driver-requested stops directly to the original Booking Stop collection does not preserve the difference between the accepted route and a proposed or approved route change.

### Recommendation

Retain `BookingStop` for the accepted initial route and add:

```text
BookingRouteVersion
- booking_route_version_id
- booking_id
- version
- route_snapshot_id
- source: INITIAL_QUOTE, APPROVED_CHANGE, OPERATIONAL_REROUTE
- active_from
- superseded_at, optional

RouteChangeRequest
- route_change_request_id
- booking_id
- requested_by_user_id
- base_route_version_id
- proposed_route_snapshot_id
- proposed_quote_id
- status: PENDING, APPROVED, DECLINED, EXPIRED, CANCELLED
- reason, optional
- requested_at
- decided_at, optional
- decided_by_user_id, optional
- resulting_receivable_id, optional
```

Only customer approval should promote a proposed route into a new active route version and create an additional charge.

### 4.10 Financial balances may drift

`AccountsReceivable` currently stores amount due, amount paid, and outstanding balance as separate mutable values. These values can become inconsistent if updates fail or occur out of order.

### Recommendation

For strict documentation compliance, retain `AccountsReceivable` as the booking-level summary. Add authoritative payment allocation records:

```text
PaymentAttempt
- payment_attempt_id
- payment_id
- provider_event_id, optional
- status
- failure_code, optional
- occurred_at
- payload_hash, optional

PaymentAllocation
- payment_allocation_id
- payment_id
- booking_id or receivable_id
- amount
- allocated_at

RefundAllocation
- refund_allocation_id
- refund_id
- payment_allocation_id
- amount
```

Recalculate or update the Accounts Receivable summary transactionally from successful allocations and refunds.

Enforce that payment allocations do not exceed settled payment amounts and refunds do not exceed eligible allocated amounts.

### 4.11 Destructive cascade policies threaten history

Several booking-owned financial and operational records currently use cascade deletion. Deleting a booking could remove assignment, pricing, payment, proof, receivable, cancellation, or outsourcing evidence.

### Recommendation

- Do not physically delete a submitted booking.
- Use restrictive deletion for commercial and operational history.
- Use soft deletion or deactivation for mutable catalog records.
- Use an explicit privacy and retention workflow to anonymize personal information without destroying required transaction history.
- Reserve cascade deletion for unpublished drafts or child records that have no independent audit value.

### 4.12 Database-level checks are incomplete

Important invariants currently rely primarily on application validation.

Recommended database checks include:

- Passenger count must be greater than zero.
- Booking end time must be after start time.
- Latitude and longitude must be within valid bounds.
- Distances, durations, prices, costs, penalties, and allocations must not be negative.
- Effective-until must be later than effective-from.
- Quote expiry must be later than creation.
- Refund allocations must not exceed eligible payments.
- Status-dependent timestamps must be internally consistent.

Some checks require reviewed custom migration SQL because Prisma cannot express every PostgreSQL constraint.

### 4.13 Reliable cross-module handoffs are missing

Payment confirmation, assignment, review, notification, and cancellation require reliable coordination. Direct cross-module writes create coupling, while in-memory events may be lost after a database commit.

### Recommendation

Add separate audit and delivery concepts:

```text
AuditEvent
- actor and role
- action
- record type and identifier
- previous and new summaries
- reason, optional
- request and correlation identifiers
- occurred_at

OutboxMessage
- message_id
- aggregate_type
- aggregate_id
- event_type
- schema_version
- payload_json
- occurred_at
- available_at
- published_at, optional
- attempt_count
- last_error, optional

ProcessedMessage
- consumer_name
- message_id
- processed_at
```

Write domain changes, lifecycle transitions, and outbox messages in the same database transaction. Consumers must deduplicate messages.

Audit events must not be used as the delivery queue.

### 4.14 External API clients require a separate security boundary

API keys must not grant access to internal controllers, raw Prisma entities, or direct Supabase tables.

### Recommendation

Add:

```text
ApiClient
- api_client_id
- client_name
- organization_name
- contact_email
- status
- approved_by_staff_id
- approved_at, optional
- revoked_at, optional
- created_at

ApiCredential
- api_credential_id
- api_client_id
- key_prefix
- secret_hash
- scopes
- expires_at, optional
- last_used_at, optional
- revoked_at, optional
- rotated_from_id, optional
- created_at

ApiRequestAudit
- api_request_audit_id
- api_client_id
- api_credential_id
- route_template
- response_status
- correlation_id
- units_consumed
- requested_at
```

Store only a secure hash of each key. Show the plaintext secret once. Support scopes, expiration, rotation, revocation, quotas, rate limits, and request auditing.

The initial external API should use an explicit field allowlist.

Recommended initial data:

- Active Tour Packages
- Published package stops
- Public vehicle types and passenger capacities
- General service-area information
- Optional non-reserving quotes after approval

Prohibited by default:

- Customer identity and contact information
- Individual bookings and precise trip routes
- Driver identity, contact details, and licence information
- Vehicle plate numbers and exact schedules
- Live or historical locations
- Payments, payment proofs, refunds, and receivables
- Internal availability counts and pricing inputs
- Maintenance, compliance, and audit records

## 5. Recommended relationship flow

```text
VehicleType and TourPackage catalog
              |
              v
       RouteSnapshot
              |
              v
 Versioned PricingConfiguration
              |
              v
         BookingQuote
              |
              v
            Booking
        /       |       \
   Payment  Reservation  Booking Review
                  |
                  v
          Assignment History
                  |
                  v
      TravelSlip and Route Versions
```

## 6. Demo-critical schema scope

For the booking demonstration targeted for October 8, 2026, prioritize:

1. Data-driven or explicitly approved vehicle types.
2. Tour Package and package-stop administration.
3. Versioned Admin pricing configuration.
4. Geoapify-backed route snapshots.
5. Expiring, single-use booking quotes.
6. Idempotent booking creation from a quote.
7. Booking status transition history.
8. Customer-owned booking list and detail projections.

The defensible demo boundary is:

```text
Admin publishes pricing
-> Customer requests route and quote
-> Customer accepts quote once
-> Backend creates AWAITING_PAYMENT booking
-> Customer views server-confirmed booking history
```

The demo must not claim payment confirmation, resource reservation, final assignment, or production-ready partner access unless those capabilities are implemented and evidenced.

## 7. Phased migration plan

### Phase 0: before applying the current booking-domain migration

- Resolve vehicle-type configurability.
- Extend and version pricing configuration.
- Add route snapshots and booking quotes.
- Add booking status transitions and idempotency.
- Review deletion policies.
- Regenerate and review the migration from the approved schema.

### Phase 1: before payment or assignment is represented as complete

- Add payment attempts and provider-event deduplication.
- Add payment and refund allocations.
- Add resource reservations.
- Add database overlap constraints.
- Permit multiple historical assignments per booking.
- Add transactional outbox and processed-message records.
- Implement Staff Booking Review records and state transitions.

### Phase 2: before trip execution

- Add route versions and route-change requests.
- Add vehicle and Driver designation history.
- Add turnaround and maintenance resource blocks.
- Add recovery and reassignment history.

### Phase 3: before external API launch

- Approve the data-classification matrix.
- Add API clients, credentials, scopes, quotas, and request auditing.
- Publish dedicated partner DTOs and OpenAPI documentation.
- Add credential rotation and revocation.
- Verify field-level authorization and log redaction.

### Phase 4: before enabling FastAPI pricing

- Keep deterministic pricing as the authoritative fallback.
- Introduce FastAPI in shadow mode.
- Record model version, suggestion, bounds result, fallback decision, latency, and failure category.
- Compare model suggestions with deterministic results.
- Enable customer-facing use only after approved accuracy, safety, and fallback evidence.

## 8. Documentation-compliance strategy

The team should maintain a requirements traceability matrix rather than estimating compliance from table count.

| Requirement ID | Documented behavior | Owning module | Schema evidence | Endpoint or event | Test evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-BKG-03 | Obtain route distance and duration from Geoapify | Routing | RouteSnapshot | `POST /v1/quotes` | Provider contract test | Planned |
| REQ-BKG-08 | Prevent overlapping active reservations | Assignments | ResourceReservation | Internal assignment command | PostgreSQL concurrency test | Missing |
| REQ-BKG-09 | Maintain separate lifecycle states | Booking and connected modules | Current state plus transition records | Commands and events | Transition matrix tests | Partial |
| REQ-PRC group | Apply bounded pricing and fallback | Pricing | PricingConfiguration, PricingCalculation, BookingQuote | `POST /v1/quotes` | Golden calculation vectors | Planned |
| REQ-IAM-03 | Customer accesses only owned records | Bookings | customer_user_id | Customer booking queries | Ownership HTTP tests | Partial |

Use these statuses:

- Fully compliant
- Partially compliant
- Not implemented
- Deferred
- Not applicable, with approved reason

The compliance percentage should be calculated from approved, testable requirements. The existence of a table alone is not implementation evidence.

## 9. Team decisions required

The following decisions should be approved before editing the Prisma schema:

1. Can Administrators create arbitrary vehicle types, or only activate and configure an approved list?
2. What deterministic formula will be used for Custom Trips during the demo?
3. How long is a booking quote valid?
4. Is preliminary availability required before quoting, and how will it be described to customers?
5. Does booking creation stop at `AWAITING_PAYMENT` for the demo?
6. Will the demo include a controlled manual-payment workflow?
7. Which booking and financial records may ever be physically deleted?
8. What is the approved retention period for routes and precise location data?
9. Which Staff permissions may publish prices, confirm manual payments, process refunds, and issue API keys?
10. Which exact fields may the first external API expose?
11. Is direct Supabase client access allowed, or must all operational access pass through NestJS?
12. How will the team calculate and approve the required documentation-compliance percentage?

## 10. Review checklist

- [ ] Product owner confirms alignment with the approved ERD and SRS.
- [ ] Team resolves all decisions in Section 9.
- [ ] Schema changes preserve documented entity names or record approved deviations.
- [ ] Every new table has a stated owner and lifecycle purpose.
- [ ] Published pricing and accepted customer terms are immutable.
- [ ] Financial and operational history cannot be erased accidentally.
- [ ] Database constraints cover concurrency and critical invariants.
- [ ] Customer, Staff, Admin, Driver, and partner response fields are explicitly allowlisted.
- [ ] Migration SQL is reviewed before it is applied.
- [ ] The traceability matrix is updated with actual test evidence.
- [ ] Demo limitations are documented and presented truthfully.

## 11. Proposed approval outcome

If approved, the next step is to revise the Prisma schema and regenerate the pending migration before applying it to any shared database.

Implementation should begin with the Phase 0 changes and the demo-critical vertical slice. Payment, final reservation, assignment, trip operations, FastAPI pricing, and external partner access remain separate release gates.
