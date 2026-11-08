# Backend implementation and issue reconciliation

Reviewed: November 8, 2026. Baseline: dev.

Completed below means the named scoped behavior exists in code, not that it is
runtime-verified or production-ready. Source and diff review were performed.
Tests, formatter, lint, type checks, build and migrations were not run.

## Current source coverage

| Area | Status | Evidence and boundary |
| --- | --- | --- |
| Auth and profiles | Implemented core | [Auth](../../src/auth/auth.controller.ts), [profiles](../../src/user-profiles/user-profiles.controller.ts): signup/login/me, customer completion/edit, Admin profile list. Refresh/logout hardening remains. |
| Admin staff | Implemented | [Controller](../../src/staff/staff-admin.controller.ts), [service](../../src/staff/staff.service.ts): create from existing identity, paginated list/detail, profile/employment changes. |
| Fleet and driver records | Implemented core | [Admin](../../src/fleet/fleet-admin.controller.ts), [operations](../../src/fleet/fleet.controller.ts): vehicle create/edit/soft-delete, driver create/edit/deactivate, filtered lists/details, readiness and designated pairs. These are not driver trip endpoints. |
| Packages and deterministic pricing | Implemented | [Packages](../../src/tour-packages/tour-packages.controller.ts), [pricing](../../src/pricing/pricing.module.ts): Admin-managed package/stops/activation and active pricing gateway. FastAPI is separate. |
| Quotes and customer bookings | Implemented core | [Bookings](../../src/bookings/bookings.service.ts): route-backed expiring quotes, customer-owned reads, single-use submission. #54 binds retries to customer and quote. |
| Booking Review | Implemented subset | [Review](../../src/bookings/booking-reviews.service.ts): outsourcing details and customer/staff decisions. Revision/claim/expiry hardening remains. |
| Manual full-payment verification | Implemented initial slice | [Payments](../../src/payments/payments.service.ts), [contract](../api/manual-payments-and-assignment.md): active non-driver Staff/Admin record and decide receipts with immutable audit. Customer proof upload and deadlines remain. |
| Internal assignment | Implemented initial slice | [Allocator](../../src/assignments/assignments.service.ts), [eligibility](../../src/fleet/allocation-eligibility.ts): durable pending request, original-submission priority among overlapping paid requests, locked allocation and database overlap constraints. Full replacement/recovery/turnaround remains. |
| Driver trips, general aftercare, external API | Not implemented | Driver execution, trip changes, cancellation/refund/receivables, turnaround and partner API are separate open work. |
| Notifications and audit | Partial | Existing booking notifications/transitions plus payment audit/request records. General delivery/outbox/read APIs remain. |

## Delivery records

- #53: retry ownership issue, closed after merge into dev in #54.
- #55: manual full-payment and initial allocation slice under #16 and #17.
- The original twenty open roadmap issues are reconciled below. None is fully
  satisfied as written solely because an initial module exists. They remain
  open with explicit remaining scope; no production-readiness closure is inferred.
- Older progress documents retain historical test results and are not evidence
  that November 8 source checks passed.

## Open issue audit

| Issue | Review |
| --- | --- |
| [#35](https://github.com/duskysabs/ROAMIGO-backend/issues/35) | Cross-repository dependency, not verifiable from backend source. Backend catalog/quote/submit/read APIs exist; actual frontend integration, loading/error behavior and end-to-end rehearsal require evidence from the frontend owner/repository. Keep open. |
| [#32](https://github.com/duskysabs/ROAMIGO-backend/issues/32) | Awaiting client/product decisions. No approved partner field allowlist/key governance or external API implementation was found. Do not expose private records or invent consent/approval. Keep open. |
| [#30](https://github.com/duskysabs/ROAMIGO-backend/issues/30) | Not implemented as the requested cross-domain operational query API. Existing review/fleet lists and #55's payment/allocation queues cover narrower use cases. Full booking timeline, provider failure and admin audit-query endpoints remain. Keep open. |
| [#29](https://github.com/duskysabs/ROAMIGO-backend/issues/29) | Partial. Booking/review flows write notification rows. General read/read-status APIs, durable event consumption, reminders/deadlines, deduplication and delivery/retry tracking remain. Keep open. |
| [#28](https://github.com/duskysabs/ROAMIGO-backend/issues/28) | Not implemented. Status enum values and maintenance models are not a turnaround checklist/release workflow. Completion, cleaning/inspection/refuelling checks, defects, historical evidence and authorized release remain. Keep open. |
| [#27](https://github.com/duskysabs/ROAMIGO-backend/issues/27) | Not implemented. No driver stop-request, customer consent/repricing, atomic route revision or added receivable API exists. Depends on driver execution and financial boundaries. Keep open. |
| [#26](https://github.com/duskysabs/ROAMIGO-backend/issues/26) | Not implemented. Driver records exist, but driver-scoped assignment/trip controllers, acknowledgement, start/completion and navigation responses do not. Discuss the role separation and recovery/turnaround dependencies after the payment/initial allocation slice. Keep open. |
| [#25](https://github.com/duskysabs/ROAMIGO-backend/issues/25) | Not implemented as full recovery. #55 retains initial paid-but-unallocated requests and authorized retries. It does not replace an existing assignment, preserve replacement history, handle driver decline/timeouts or implement post-confirmation outsourcing. Keep open. |
| [#24](https://github.com/duskysabs/ROAMIGO-backend/issues/24) | Not complete. #55 introduces a specific durable payment-to-assignment request and immutable payment audit, not the generalized domain-event outbox. Versioned events, idempotent consumers, bounded retries/poison events, correlation and operational replay remain. Keep open. |
| [#23](https://github.com/duskysabs/ROAMIGO-backend/issues/23) | Partial. Fleet/driver master-data writes, paginated filtered lists/details, status/pairing and availability exist. #55 shares the eligibility predicate across quotes/availability/allocation, adds maintenance checks and resource guards. Full document/turnaround/readiness history, consistent race-error mapping and executed concurrency coverage remain. Keep open. |
| [#22](https://github.com/duskysabs/ROAMIGO-backend/issues/22) | Partial. Package create/edit/ordered stops/activation, public active catalog, Staff reads and Admin deterministic pricing are implemented. Vehicle-type administration/lifecycle, durable before/after actor/reason audit, complete application read ports and HTTP/persistence evidence remain. Keep open. |
| [#21](https://github.com/duskysabs/ROAMIGO-backend/issues/21) | Coordination tracker requires updated baseline: staff/fleet/package/pricing administration, routing, quotes, review and customer reads are implemented on dev. #54 fixes retry ownership. #55 covers manual payment and initial allocation. Full parent acceptance criteria, runtime evidence, driver operations and later phases remain open. See documentation/audit-report/implementation-tracker-2026-11-08.md. |
| [#20](https://github.com/duskysabs/ROAMIGO-backend/issues/20) | Partial. Mocked unit/HTTP suites and API documentation exist. #55 adds an opt-in local Postgres suite for payment approval and allocation constraints, authored but not run. Full authenticated booking DB coverage, provider contract suites, traceability, CI and recorded concurrency evidence remain. Keep open. |
| [#19](https://github.com/duskysabs/ROAMIGO-backend/issues/19) | Not implemented as a complete API workflow. Schema models exist; general cancellation/refund/receivable policy, atomic release, claimable processing and financial reconciliation remain. Rejection of a pre-payment outsourcing offer is not general cancellation/refund support. Keep open. |
| [#18](https://github.com/duskysabs/ROAMIGO-backend/issues/18) | Partial. Submission may opt into BOOKING_REVIEW; Staff list/detail, outsourced offers, rejection, customer approval/rejection, transition rows and notification rows exist. Concurrent offer/decision handling, complete offer revision/consent history, close reasons/expiry and queue claim policy do not meet all original criteria. Keep open. |
| [#17](https://github.com/duskysabs/ROAMIGO-backend/issues/17) | Partial; initial internal allocation is tracked in #55 with durable pending requests and separate vehicle/driver overlap constraints. Complete preparation/turnaround/documents, replacement history, release/recovery policy and executed real-database concurrency evidence remain. Keep the parent open. |
| [#16](https://github.com/duskysabs/ROAMIGO-backend/issues/16) | Partial; first manual-payment slice is tracked in #55. Approved policy: full PHP payment before assignment; active non-driver Staff and Administrators may verify; driver-linked Staff are excluded. PayMongo personal onboarding is being considered separately. Automatic checkout/webhooks, customer proof storage and payment deadlines are outside this first slice. Keep the parent open. |
| [#15](https://github.com/duskysabs/ROAMIGO-backend/issues/15) | Deferred enhancement. AdminPricingQuoteGateway is implemented and uses active deterministic configuration; the old fail-closed description is obsolete. No working FastAPI RFR client/guardrail integration was found. Keep open as later phase, not a manual-payment MVP blocker. |
| [#14](https://github.com/duskysabs/ROAMIGO-backend/issues/14) | Partial. Durable quotes, customer-controlled Booking Review, customer-scoped quote-bound retry handling (#54), and initial transition records exist. #55 adds the manual-payment/initial allocation transitions. A centralized legal-transition policy, operating-scope validation, complete stale-command behavior and failed-attempt audit remain. Keep open. |
| [#12](https://github.com/duskysabs/ROAMIGO-backend/issues/12) | Partial. Location autocomplete/resolution and ordered route preview are implemented, and Custom Trip quotes retain server route evidence. Startup configuration validation, endpoint rate limiting, safe provider metrics and complete provider/integration evidence still need work. Keep open. |

## Next priorities and driver discussion

1. Apply the migrations only after baseline/data preflight, then run the
   [focused and isolated database checks](../testing/manual-payments-postgres.md).
   Source merge does not deploy or execute the migration.
2. Rehearse manual receipt verification, capacity loss, ownership denial,
   driver-linked operator denial and assignment retry against non-production.
3. Finalize driver identity/role separation, acknowledgement/decline policy,
   recovery triggers and completion-to-turnaround responsibilities for #26.
   Current Driver records are linked to STAFF profiles, while the enum also
   contains DRIVER. Do not expose financial DTOs to either driver identity.
4. Design release/replacement history and turnaround before shipping trip
   completion or decline. Current one-assignment-per-booking schema does not
   preserve multiple replacement rows.
5. Complete release gates and general outbox/notifications/aftercare after the
   initial route-to-quote-to-manual-payment-to-assignment path is evidenced.
