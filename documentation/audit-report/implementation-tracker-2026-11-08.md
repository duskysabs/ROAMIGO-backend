# Backend implementation and issue reconciliation

Reviewed: November 8, 2026. Baseline: dev.

Completed below means the named scoped behavior exists in code, not that it is
runtime-verified or production-ready. Source and diff review were performed.
Tests, formatter, lint, type checks, build and migrations were not run.

Driver update (#57): automatic dispatch with a configurable 120-minute default,
owned Driver execution, decline/timeout recovery history and completion holds
are implemented. Verification and migrations remain not run. See the
[Driver API contract](../api/driver-execution-contract.md).

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
| Driver trips | Implemented initial slice | Owned reads, acknowledgement/decline, en-route/arrival/start/completion, external navigation, immutable completion snapshot and turnaround holds. Full release remains #28. |
| Trip changes, general aftercare, external API | Not implemented | Added-stop consent/repricing, cancellation/refund/receivables, full turnaround and partner API remain open. |
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
| [#29](https://github.com/duskysabs/ROAMIGO-backend/issues/29) | Partial. Booking/review and automatic dispatch/recovery write notification rows. General inbox/read status, durable external delivery and scheduled reminders remain. |
| [#28](https://github.com/duskysabs/ROAMIGO-backend/issues/28) | Partial. Start/completion persist operational holds and completion blocks both resources in TURNAROUND. Checklists, defects, configured release validation and automatic return to availability remain. |
| [#27](https://github.com/duskysabs/ROAMIGO-backend/issues/27) | Not implemented. No driver stop-request, customer consent/repricing, atomic route revision or added receivable API exists. Depends on driver execution and financial boundaries. Keep open. |
| [#26](https://github.com/duskysabs/ROAMIGO-backend/issues/26) | Initial source slice implemented in #57: automatic dispatch, owned reads/navigation, legal Driver commands, response deadlines, completion snapshot and immutable audit. Hosted scheduling, runtime evidence and release/privacy retention work remain; parent stays open. |
| [#25](https://github.com/duskysabs/ROAMIGO-backend/issues/25) | Partial. Driver decline and timeout preserve history, enter RECOVERY_REQUIRED, attempt another eligible pair and retain unresolved requests in the Staff queue. Breakdown, acknowledged-driver withdrawal, outsourcing and general operational recovery remain. |
| [#24](https://github.com/duskysabs/ROAMIGO-backend/issues/24) | Partial. Specific durable assignment requests, immutable payment/Driver audit and explicit system actors exist. General versioned outbox delivery, poison-event handling and safe replay remain. |
| [#23](https://github.com/duskysabs/ROAMIGO-backend/issues/23) | Partial. Shared eligibility now excludes operational holds and supports Staff/Driver profile labels. Database guards protect active resources. Full document/readiness history and uniform adapter conflict mapping remain. |
| [#22](https://github.com/duskysabs/ROAMIGO-backend/issues/22) | Partial. Package create/edit/ordered stops/activation, public active catalog, Staff reads and Admin deterministic pricing are implemented. Vehicle-type administration/lifecycle, durable before/after actor/reason audit, complete application read ports and HTTP/persistence evidence remain. Keep open. |
| [#21](https://github.com/duskysabs/ROAMIGO-backend/issues/21) | Coordination tracker requires updated baseline: staff/fleet/package/pricing administration, routing, quotes, review and customer reads are implemented on dev. #54 fixes retry ownership. #55 covers manual payment and initial allocation. Full parent acceptance criteria, runtime evidence, driver operations and later phases remain open. See documentation/audit-report/implementation-tracker-2026-11-08.md. |
| [#20](https://github.com/duskysabs/ROAMIGO-backend/issues/20) | Partial. Mocked unit/HTTP suites and API documentation exist. #55 adds an opt-in local Postgres suite for payment approval and allocation constraints, authored but not run. Full authenticated booking DB coverage, provider contract suites, traceability, CI and recorded concurrency evidence remain. Keep open. |
| [#19](https://github.com/duskysabs/ROAMIGO-backend/issues/19) | Not implemented as a complete API workflow. Schema models exist; general cancellation/refund/receivable policy, atomic release, claimable processing and financial reconciliation remain. Rejection of a pre-payment outsourcing offer is not general cancellation/refund support. Keep open. |
| [#18](https://github.com/duskysabs/ROAMIGO-backend/issues/18) | Partial. Submission may opt into BOOKING_REVIEW; Staff list/detail, outsourced offers, rejection, customer approval/rejection, transition rows and notification rows exist. Concurrent offer/decision handling, complete offer revision/consent history, close reasons/expiry and queue claim policy do not meet all original criteria. Keep open. |
| [#17](https://github.com/duskysabs/ROAMIGO-backend/issues/17) | Partial. Initial allocation, one active assignment per booking, retained decline history, recovery allocation and overlap constraints exist. Complete readiness/preparation/release policy and executed concurrency evidence remain. |
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
3. Configure and rehearse the overdue-response job and initial recovery in #26.
   Driver-linked STAFF identities now receive Driver permissions; future role
   conversion must preserve those boundaries.
4. Complete #28 turnaround checklists and release. Resources stay blocked after
   completion until an authorized release lifecycle exists. Add general recovery
   and outsourcing under #25.
5. Complete release gates and general outbox/notifications/aftercare after the
   route-to-quote-to-manual-payment-to-assignment-to-Driver path is evidenced.
