# Booking sales channel and manual-payment eligibility

Issue: #63. This adds backend policy, not a face-to-face frontend or online checkout.

## Server-owned origin

New customer quotes and submissions use ONLINE. Customers cannot send a channel,
operator or provenance field. Only an active non-driver Staff/Admin operator can
use the face-to-face endpoints below. The customer must already have an active
Customer profile. This path does not create Auth identities or privileged users.

| Route | Body and behavior |
| --- | --- |
| POST /staff/bookings/face-to-face/quote | Existing quote DTO plus customerUserId and a trimmed 3 to 500 character reason. Server routing/pricing and selection validation are reused. |
| POST /staff/bookings/face-to-face | quoteId, idempotencyKey and optional requestReviewIfUnavailable. Only the issuing operator can consume the quote. |

The quote stores FACE_TO_FACE, operator and reason separately from the booking
request snapshot. Submission rechecks operator employment/account/driver linkage
and Customer status, binds the booking to that channel, and records the operator
as the transition actor. Routing/pricing occurs outside the write transaction.
Operator write transactions have a bounded 15-second deadline. A quote remains
expiring, single-use and non-reserving. Unavailable capacity uses the existing
explicit review option; it never invents an internal assignment.

Customer submission can consume only ONLINE quotes without an operator. Operator
submission can consume only its own FACE_TO_FACE quote, including retries after
consumption. Idempotency keys remain scoped to the customer and bound to the
quote and origin. Another channel cannot recover the booking using the same key.

Manual receipt entry and approval require FACE_TO_FACE under the booking lock,
before an idempotent result or financial mutation is returned. Existing amount,
operator, immutable decision and assignment rules still apply. ONLINE and
LEGACY_UNKNOWN return 409. Rejection of old pending evidence remains allowed;
rejection never claims a refund. A historical approved receipt cannot be used to
bypass the new channel restriction by replaying approval.

Database triggers make booking/quote origin immutable and reject new manual
receipts or newly approved manual receipts for other channels. Historical paid
records remain readable; this does not reverse payments, cancel bookings or
remove existing assignments.

## Migration and existing records

202611200001_booking_sales_channel adds LEGACY_UNKNOWN as the default for existing
bookings and quotes. It never infers face-to-face origin from a receipt, role,
date or test fixture. Old unconsumed quotes must be refreshed. Historical matching
customer submission replays with unknown origin must be recovered through owned
booking reads, not reclassified automatically.

Do not deploy the application before applying the reviewed migration to the
intended environment. No migration was applied during implementation. Take a
backup and rehearse the full chain on a disposable database first. Any backfill
needs independent documentary evidence, an approved list of records and a
separately reviewed migration/audit record. No ordinary API changes the channel.
The immutability triggers deliberately prevent ad hoc operational reclassification.
Do not edit existing payments to make a legacy booking eligible.

Existing integration receipts were synthetic, not proof that their bookings were
face-to-face. They stay LEGACY_UNKNOWN after migration. Create fresh fixtures
through the operator path for manual-payment verification.

## Pending PayMongo integration

PR #67 is independent and unmerged. When rebasing it, retain both channel checks
and its checkout/manual exclusion checks. Online checkout and late webhooks must
also validate the server-owned channel/state; face-to-face and unknown bookings
must not acquire an online checkout. This branch does not enable provider calls,
apply that PR's migration or claim compatibility testing with its unmerged code.

## User-run verification

Client generation succeeded. Tests, HTTP/database suites, lint and build are not
run. From this worktree, run:

```bash
npm test -- test/unit/booking-sales-channel.spec.ts test/unit/booking-quote-lifecycle.spec.ts test/unit/payments.service.spec.ts
npm run test:e2e -- test/e2e/booking-sales-channel.e2e-spec.ts test/e2e/payments.e2e-spec.ts
npm run lint
npm run build
```

Use documentation/testing/manual-payments-postgres.md for a fresh disposable
local database and all migrations. The opt-in suite adds ONLINE/LEGACY_UNKNOWN
denial at both service and trigger boundaries, attempted concurrent channel
reclassification and competing review decisions. These cases are authored, not
executed. Do not use the hosted project as a substitute for an isolated race test.
