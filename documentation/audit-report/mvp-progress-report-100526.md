# MVP Progress Report

**Originally recorded:** October 5, 2026

**Current-state review:** November 14, 2026

**Review scope:** Backend source, schema, migrations, documentation, and test
definitions in the current checkout. Frontend and deployed-environment readiness
have not been verified.

## Current position

The backend supports the payment-independent booking journey through either
`AWAITING_PAYMENT` or `BOOKING_REVIEW`. It must not yet be presented as a paid,
reserved, assigned, or completed trip workflow.

Implemented work includes:

- Supabase signup, login, resumable customer onboarding, profiles, and role
  guards.
- A squashed Prisma migration baseline for the current application schema.
- Safe non-production Administrator and Customer provisioning.
- Administrator-managed fixed pricing with persisted calculation snapshots.
  Custom Trip route metrics are retained as evidence; they do not currently
  determine the quoted price. FastAPI/ML pricing is not integrated.
- Customer catalog, quote, booking submission, booking list, and booking detail
  APIs.
- Durable ten-minute quote expiry, single-use quote consumption, and idempotent
  booking submission.
- Geoapify autocomplete, place resolution, ordered route preview, and binding of
  authoritative route evidence to Custom Trip quotes.
- Advisory vehicle and Driver eligibility checks; these do not reserve resources.
- Fleet vehicle and Driver master-data APIs, paginated and filtered reads, detail
  views, designated pairing, operational status validation, licence checks,
  Driver deactivation, and vehicle soft deletion.
- Administrator-only Staff onboarding from an existing Supabase identity,
  paginated Staff reads, profile maintenance, and employment lifecycle changes
  with linked account and Driver deactivation safeguards.
- Tour Package administration and active customer catalog reads.
- Booking Review for unavailable internal resources, including Staff-recorded
  outsourced details, customer approval or rejection, Staff rejection,
  transition evidence, and in-application notifications.
- Non-production demo-data setup and rehearsal documentation.

## Remaining payment-independent work

| Area | Remaining work |
| --- | --- |
| Documentation | Replace the root starter README; fill the empty database overview, migration overview, and deployment overview; distinguish planned architecture integrations from implemented components; refresh test evidence. The current working tree also relocates Postman files to `test/postman`; update the index link when that separate change is committed. |
| Database verification | Reconcile the squashed migration baseline and the subsequent unique Driver licence migration with the approved non-production database; record current migration status and schema evidence. |
| Integration evidence | Add an isolated Postgres or Supabase-compatible harness and authenticated database-backed tests for quote, submission, ownership, idempotency, Booking Review, catalog authorization, Staff lifecycle, and fleet operations. |
| Geoapify hardening | Extend the existing enabled/key startup check and request timeout with complete configuration validation, application request limits, safe latency/failure observability, provider contract tests, and an isolated live check. |
| Authentication hardening | Complete configuration validation, standards-compliant Bearer parsing, login input bounds and normalization, refresh/logout and revocation policy, password recovery/change, email-change flows, and real Supabase integration coverage. Login throttling remains process-local. |
| Master data | Complete vehicle-type lifecycle decisions and durable actor/reason/before-after audit history. |
| Fleet readiness | Unify booking and fleet eligibility rules; add document/maintenance checks and historical readiness evidence. Pagination, filters, detail reads, licence checks, and validated status changes are already implemented in the fleet module. |
| Platform reliability | Add a transactional outbox and idempotent audit/event handoff for booking, pricing, and review actions. |

## Availability policy mismatch

`BookingsService.hasEligibleInternalVehicle` checks capacity, vehicle/Driver
statuses, active Staff employment, and overlapping assignments. Unlike
`FleetService.availability`, it does not check Driver licence validity through
the requested trip end or the linked user account status. A customer quote or
submission can therefore report internal availability for a pair excluded by
the Staff fleet availability endpoint. Share one eligibility policy and add
regression coverage before relying on either result operationally.

## Remaining booking-to-trip work

| Area | Unfinished behavior |
| --- | --- |
| Payments | PayMongo intent creation, signed and idempotent webhook handling, and an authorized, audited manual-payment verification workflow if supported. |
| Reservation and assignment | Post-payment availability rechecks, atomic vehicle/Driver assignment, and PostgreSQL-level protection against overlapping schedules. |
| Dynamic pricing | External FastAPI/ML service contract, HTTP integration, and model-specific calculation evidence. The fixed-price MVP already persists its calculation snapshot. |
| Trip and financial lifecycle | Customer cancellation, refunds, receivables, travel slips, and Driver trip actions. Schema entities alone do not implement these workflows. |
| Outsourced access | Temporary outsourced-driver accounts, booking-scoped permissions, expiry, and revocation. |
| Supporting operations | Notification inbox/read APIs, authorized file-upload workflows, maintenance/compliance workflows, and reporting. Current notification writes cover only a limited booking/review subset. |
| Retention and audit | Financial and operational history retention, durable administrative change history, and reliable event delivery before activating the later lifecycle. |

## Current evidence and limits

Historical evidence recorded on October 27, 2026 reported:

- NestJS build;
- lint;
- 63 unit tests; and
- 21 HTTP-level tests.

The November 14 review found newer Staff and expanded fleet unit tests plus
Staff and fleet HTTP test files. The historical counts above are not a current
verification result. Build, lint, automated tests, and Postman coverage were not
rerun during this review because Node.js and pnpm were unavailable in the shell,
including a fresh login shell.

The HTTP-level suite uses mocked application boundaries and placeholder test
configuration. It is not evidence of a real Supabase or Postgres integration.
Live provider and current non-production migration evidence must be recorded
separately.

## Demonstrable boundary

```text
Catalog -> location search -> route preview -> server-owned quote
-> booking submission
   -> AWAITING_PAYMENT when advisory internal capacity is available
   -> BOOKING_REVIEW when unavailable and the customer opts in
-> customer booking history/detail
```

Neither outcome reserves a vehicle, assigns a Driver, or confirms payment.

## Recommended next sequence

1. Unify booking and fleet eligibility, including licence validity and account
   status, and cover the mismatch with regression tests.
2. Reconcile and verify both migrations in an approved non-production environment.
3. Add database-backed booking, authorization, Staff, and fleet integration tests;
   run and record current build, lint, automated-test, and Postman evidence.
4. Complete authentication session/input/configuration hardening and Geoapify
   request limits, observability, and provider verification.
5. Complete readiness evidence, retention decisions, and transactional audit/event
   delivery; bring setup and deployment documentation up to date.
6. Implement verified payment confirmation and conflict-safe transactional
   assignment, then cancellation/refund and operational trip workflows.
7. Integrate external ML pricing when its contract is available, and run the
   guarded non-production rehearsal with redacted evidence.

## Overall assessment

The backend is no longer a schema-only prototype. It has controlled pricing,
protected customer ownership, durable route and price evidence, idempotent
submission, advisory availability, and a pre-confirmation exception path.

It should currently be described as:

> Payment-independent booking MVP implemented; real-database integration and
> production hardening remain.

Do not present it as fully SRS-compliant or production-ready until database,
provider, concurrency, retention, and operational evidence is complete.
