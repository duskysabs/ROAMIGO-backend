# Capstone ERD Alignment Review

**Status:** Draft for team review
**Date:** October 5, 2026
**Scope:** The proposed ERD supplied for team review, the Capstone documentation ERD, the committed Prisma schema and migrations, and the booking MVP additions currently in development.

## 1. Purpose and decision boundary

This review records where the implemented database differs from the Capstone Entity Relationship Diagram (ERD), why the difference exists, and whether it is safe to retain.

The Capstone ERD remains the primary academic and product reference. It is not, however, an automatically safe production schema. Where the ERD cannot preserve an accepted price, reconstruct a booking history, or safely prevent resource conflicts, the implementation should add narrowly scoped supporting records instead of changing the documented meaning of the existing entities.

This document is a review aid. It does not approve a database change, alter an applied migration, or authorize a destructive reset.

## 2. Sources reviewed

- **Proposed ERD image supplied for team review:** shows the same core logical model as the Capstone ERD: Supabase Auth and User Profile, Customer, Staff, Driver, fleet, packages and stops, Booking, assignment, payment, refund, receivable, pricing, maintenance, travel slip, and notifications.
- **ROAMIGO Capstone Documentation (July 2026):** Section 4.2.2, Figure 5, and Figure 5.1, which define the logical ERD. The document identifies Booking as the central transactional record and includes users, customers, staff, drivers, vehicles, packages, stops, assignments, payments, refunds, receivables, maintenance, notifications, pricing, and travel slips.
- **`prisma/schema.prisma`:** current application schema.
- **`prisma/migrations/20261002071745_tables/migration.sql`:** initial booking-domain migration. Its entities and fields substantially implement the Capstone ERD.
- **`prisma/migrations/20261005093000_booking_quote_lifecycle/migration.sql`:** additive quote and booking-transition migration.
- **`prisma/migrations/20261005013000_quote_route_evidence/migration.sql`:** pending, unmerged route-evidence migration on the booking development branch at the time of this review.

## 3. Executive assessment

The initial domain migration is broadly aligned with both the proposed ERD and the Capstone ERD. Its table names, identifiers, relationships, and core business concepts are recognizably the same design. The later `BookingQuote` and `BookingTransition` records are intentional additions required for a credible quote-to-booking flow. They are not represented in either diagram, but they preserve rather than replace the documented Booking entity.

The main risk is not that the implementation failed to copy the ERD. The main risk is treating the diagram as final physical-database design when it lacks a durable quote boundary, route snapshot model, reservation-overlap protection, reassignment history, and several financial and deletion safeguards.

The correct path is **forward-only, additive migration work**. Do not edit the already-applied `20261002071745_tables` migration, recreate its enums or tables, run `migrate reset`, or use a broad `db push` to force the database to resemble a revised diagram.

## 4. Alignment matrix

| Area | Capstone ERD | Current implementation | Classification | Risk and decision |
| --- | --- | --- | --- | --- |
| Identity and roles | Supabase Auth, User Profile, Customer, Staff, and Driver are distinct records. | `AuthUser` maps the Supabase `auth.users` identity, while `UserProfile`, `Customer`, `Staff`, and `Driver` retain the documented relationships. | Aligned implementation detail | Keeping the Supabase identity fields out of a duplicate public table is appropriate. The `user_profile` baseline must remain untouched. |
| Fleet and catalog | Vehicle Type, Vehicle, and Driver are separate, with a designated Driver on Vehicle. | The same entities and primary relationships exist. `VehicleType.vehicleType` is a fixed Prisma enum. | Partially aligned | The ERD does not require a fixed enum. An Administrator cannot add a genuinely new vehicle type without a code and migration release. Keep this limitation explicit for the MVP, then make the business catalog data-driven. |
| Packages and stops | Tour Packages and Package Stops define catalog routes; Booking Stops capture booking-specific stops. | Both models and ordered stop constraints are implemented. | Aligned | Package and booking stops are correctly distinct. A later route snapshot is still needed so edits to a package do not change historical quote evidence. |
| Booking | Booking is the central transactional reference and stores customer, vehicle type, schedule, status, route metrics, and quoted price. | `Booking` retains these fields and connects to stops, assignment, payment, receivable, cancellation, outsourcing, and pricing data. | Aligned | The booking record should remain the current-state operational record, not the only historical artifact. |
| Quote before booking | No pre-booking quote entity is shown. Pricing Calculation depends on an existing Booking. | `BookingQuote` was added with customer ownership, immutable request snapshot, price, expiry, consumption timestamp, pricing configuration, and optional resulting booking. | Intentional additive deviation | Required for the MVP flow: route and price first, create `AWAITING_PAYMENT` booking once. This is safer than creating a booking just to calculate a price. |
| Booking lifecycle history | Booking has a current `booking_status`; no transition log is shown. | `BookingTransition` records prior state, next state, actor, reason, and timestamp. | Intentional additive deviation | Required for auditability. Retain `Booking.bookingStatus` as the current-state projection. Review deletion policy because transitions currently cascade with Booking. |
| Geoapify route result | The SRS requires provider-sourced location, distance, and travel-time data. The ERD stores stop coordinates and aggregate booking distance and duration, but has no provider result entity. | The development branch adds optional JSONB `BookingQuote.routeEvidence` after server-side routing. | MVP bridge, not target schema | It captures evidence quickly, but JSONB alone does not provide a stable normalized route contract, provider versioning, or efficient queryability. Do not treat it as the final route model. |
| Pricing | Pricing Configuration, Fuel Price Record, and Pricing Calculation are connected to Booking. | The same core models exist, plus a quote points to its applied configuration. | Partially aligned | The ERD ties `PricingCalculation` to Booking, which cannot explain a price shown before a booking exists. The current deterministic admin-price fallback is suitable for the demo, but published price versions and non-overlapping effective periods are not yet enforced. |
| Assignment | One Booking Assignment is linked to a Booking, Vehicle, and Driver. | `BookingAssignment.bookingId` is unique, matching the ERD. | Aligned but structurally insufficient | A unique booking assignment prevents reassignment history. It is acceptable while assignment is outside the MVP, but must change before dispatch or recovery workflows are claimed. |
| Availability and reservation | Vehicle and Driver statuses are present. The ERD has no reservation interval or overlap constraint. | Availability checks are advisory. No database reservation or exclusion constraint exists. | Missing capability, not an MVP deviation | Do not call pre-booking availability a reservation. Add an interval-based reservation model and database overlap protection before confirming assignments. |
| Payment, refunds, and receivables | Payment, Payment Proof, Refund, Accounts Receivable, and Booking Cancellation are modeled. | These tables were created in the initial migration. The MVP stops at `AWAITING_PAYMENT`. | Schema aligned, behavior deferred | The current model stores balance fields that can drift and uses cascades for financial history. No UI or API should imply payment settlement until a separate implementation and audit pass exist. |
| Deletion history | The diagram does not specify deletion behavior. | Several transaction-owned relations cascade when a Booking is deleted. | Material design risk | A submitted Booking must not be physically deleted if doing so destroys payment, cancellation, assignment, pricing, or route evidence. Define retention and deactivation policies before those modules are activated. |
| External API access | The Capstone architecture describes backend-mediated access but does not define API-client records or public data scope. | No partner API credential model is implemented. | Correctly not implemented | Do not expose raw Prisma entities or operational tables. An approved read-only, field-allowlisted catalog API requires a separate security design. |

## 5. Why the Capstone ERD needs controlled improvements

The ERD is a good logical inventory of the business, but the following aspects are faulty or incomplete when evaluated as a physical transactional database:

1. **No durable pre-booking quote:** It cannot represent a price that a customer sees, accepts once, and then converts to a Booking. Reusing `PricingCalculation` would incorrectly require a Booking before the customer commits.
2. **No route snapshot boundary:** Booking Stops capture locations, but not the authoritative Geoapify response, calculation time, provider context, geometry, or a request fingerprint.
3. **One assignment for the whole booking:** The unique Booking Assignment relationship prevents recording decline, release, replacement, and recovery history.
4. **No conflict-proof reservation model:** status fields and application queries alone cannot stop two concurrent requests from using the same vehicle or Driver during overlapping times.
5. **Mutable financial summaries:** `amount_due`, `amount_paid`, and `outstanding_balance` can become inconsistent unless derived or transactionally maintained from payment and refund allocations.
6. **Destructive cascades are not a retention policy:** cascading from Booking into commercial and operational history is unsafe once real payment, dispatch, or auditing begins.
7. **Vehicle type is modeled as a deployment enum:** this conflicts with a future Administrator-managed catalog unless the allowed types are deliberately fixed by policy.
8. **Critical invariants are largely application-only:** schedule ordering, non-negative amounts, valid latitude and longitude, pricing-period overlap, and active resource overlap need database support where feasible.

These are design shortcomings, not evidence that the Capstone work should be discarded. The documented entities should be retained and extended with supporting history, evidence, and constraint records.

## 6. Current booking-MVP deviations and guardrails

### 6.1 Approved direction for the MVP

```text
Admin publishes deterministic pricing
-> customer supplies ordered Geoapify place IDs
-> backend resolves the route and issues an expiring quote
-> customer accepts that quote once
-> backend creates an AWAITING_PAYMENT Booking
-> customer can retrieve only their own bookings
```

This preserves the Capstone Booking entity while avoiding a false claim that payment, reservation, assignment, or dispatch is complete.

### 6.2 Route evidence on the development branch

The pending `route_evidence` JSONB column is an MVP evidence container for the exact server-resolved route used to quote a Custom Trip. It is intentionally optional so historic and Tour Package quotes remain valid.

Before considering the model stable, the team should decide whether the following normalized target is required:

```text
RouteSnapshot
- route_snapshot_id
- provider
- provider_request_id or route_id, optional
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

`BookingQuote` should reference the immutable route snapshot. Booking Stops should remain the accepted booking-route projection. This is a recommendation for a later reviewed migration, not a request to replace the current MVP branch immediately.

## 7. Required rules for future migration work

1. Do not alter or rename an applied migration, including `20261002071745_tables`.
2. Do not run `migrate reset`, broad database synchronization, or data-loss commands against the shared Supabase database.
3. Add only reviewed, forward migrations that create new public application objects or safely add nullable fields and indexes.
4. Preserve the existing `user_profile` to `auth.users` relationship and do not modify Supabase `auth` objects in application migrations.
5. For a non-null conversion or changed relationship, first add a compatible structure, backfill with reviewed SQL, validate it, then apply the constraint in a later migration.
6. Add database constraints for financial, temporal, and concurrency invariants before the affected workflow is advertised as complete.
7. Record the Capstone requirement, schema evidence, API evidence, and test evidence for every deviation.

## 8. Prioritized follow-up decisions

| Priority | Decision | Needed before |
| --- | --- | --- |
| P0 | Approve whether the deterministic admin price is a fixed base price or a defined per-distance and per-duration formula. | Demo quote behavior is finalized. |
| P0 | Confirm the quote-expiry policy and whether a quote can be regenerated after expiry. | Frontend quote acceptance is connected. |
| P0 | Confirm that the MVP stops at `AWAITING_PAYMENT`, with no reservation or assignment claim. | Demo script and UI copy are finalized. |
| P1 | Approve the long-term route snapshot design and retention period for precise location data. | Geoapify route evidence is made permanent. |
| P1 | Decide whether Admin can create arbitrary vehicle types or only manage a fixed approved list. | Vehicle catalog administration is expanded. |
| P1 | Decide the booking-retention and financial-history policy. | Payment, cancellation, and refund workflows are enabled. |
| P2 | Approve assignment-history and interval-reservation rules. | Dispatch or reassignment work begins. |
| P2 | Approve public API data classification, clients, scopes, quotas, and audit retention. | Any API key is issued to a third party. |

## 9. Review outcome requested

The team should approve or amend these statements:

- The initial migration is an acceptable implementation of the Capstone ERD baseline.
- `BookingQuote` and `BookingTransition` are accepted additive entities that preserve the documented Booking model.
- JSONB route evidence is a temporary MVP bridge, with a normalized route snapshot decision deferred to a later review.
- No applied migration will be rewritten to chase the diagram.
- Payment, reservation, assignment, dispatch, and external partner access remain separate release gates.

Once approved, create targeted issues for each P0 or P1 decision rather than making a broad schema rewrite.
