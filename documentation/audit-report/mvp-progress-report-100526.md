# MVP Progress Report

This is the historical October 27 assessment. For current source coverage,
manual payments and assignment, use the
[November 8 implementation tracker](./implementation-tracker-2026-11-08.md).

**Originally recorded:** October 5, 2026

**Current-state review:** October 27, 2026

## Current position

The backend supports the payment-independent booking journey through either
`AWAITING_PAYMENT` or `BOOKING_REVIEW`. It must not yet be presented as a paid,
reserved, assigned, or completed trip workflow.

Implemented work includes:

- Supabase signup, login, resumable customer onboarding, profiles, and role
  guards.
- A squashed Prisma migration baseline for the current application schema.
- Safe non-production Administrator and Customer provisioning.
- Administrator-managed deterministic pricing.
- Customer catalog, quote, booking submission, booking list, and booking detail
  APIs.
- Durable ten-minute quote expiry, single-use quote consumption, and idempotent
  booking submission.
- Geoapify autocomplete, place resolution, ordered route preview, and binding of
  authoritative route evidence to Custom Trip quotes.
- Advisory vehicle and Driver eligibility checks.
- Tour Package administration and active customer catalog reads.
- Booking Review for unavailable internal resources, including Staff-recorded
  outsourced details, customer approval or rejection, Staff rejection,
  transition evidence, and in-application notifications.
- Non-production demo-data setup and rehearsal documentation.

## Remaining payment-independent work

| Area | Remaining work |
| --- | --- |
| Documentation | Keep the API contract, authentication plan, migration guidance, and test evidence synchronized with merged behavior. |
| Database verification | Reconcile the squashed migration baseline with the approved non-production database and record current `prisma migrate status` evidence. |
| Integration evidence | Add an isolated Postgres or Supabase-compatible harness and authenticated database-backed tests for quote, submission, ownership, idempotency, Booking Review, and catalog authorization. |
| Geoapify hardening | Add startup configuration validation, request limits, safe latency/failure observability, provider contract tests, and an isolated live check. |
| Authentication hardening | Add startup configuration validation, standards-compliant Bearer parsing, login input bounds and normalization, refresh/logout policy, and real Supabase integration coverage. |
| Master data | Complete vehicle-type lifecycle decisions and durable actor/reason/before-after audit history. |
| Fleet readiness | Add pagination, filters, detail reads, licence/document/maintenance checks, validated status changes, and historical readiness evidence. |
| Platform reliability | Add a transactional outbox and idempotent audit/event handoff for booking, pricing, and review actions. |

## Current evidence and limits

On October 27, 2026, the merged Booking Review source passed:

- NestJS build;
- lint;
- 63 unit tests; and
- 21 HTTP-level tests.

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

1. Reconcile and verify the squashed migration baseline in an approved
   non-production environment.
2. Add database-backed booking and authorization integration tests.
3. Finish Geoapify configuration, rate-limit, observability, and provider-test
   hardening.
4. Complete authentication input/configuration hardening.
5. Complete master-data and fleet-readiness APIs that do not require assignment.
6. Add the transactional audit/event foundation.
7. Run and record the guarded non-production rehearsal with redacted evidence.

## Overall assessment

The backend is no longer a schema-only prototype. It has controlled pricing,
protected customer ownership, durable route and price evidence, idempotent
submission, advisory availability, and a pre-confirmation exception path.

It should currently be described as:

> Payment-independent booking MVP implemented; real-database integration and
> production hardening remain.

Do not present it as fully SRS-compliant or production-ready until database,
provider, concurrency, retention, and operational evidence is complete.
