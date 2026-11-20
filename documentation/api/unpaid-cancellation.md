# Customer cancellation before payment approval

Issue: #65. This is separate from paid cancellation/refunds (#19) and rejection of
an outsourced Booking Review offer.

## Contract

POST /bookings/:bookingId/cancel accepts `{ "reason": "Plans changed" }` for an
authenticated active Customer. bookingId must be a UUID; reason is trimmed and
must contain 3 to 500 characters. Unknown fields, including fee, status, category,
actor and policy values, are rejected. Success and matching replay return 201.
Other owners receive 404; non-Customer roles receive 403. Ineligible states or
another cancellation workflow return 409.

The booking must belong to the Customer and be AWAITING_PAYMENT, with no approved
or previously paid/refunded receipt, assigned pair or assignment handoff. The
service checks account/role again at the data boundary. It locks the Customer
profile and the owned booking, then performs all reads and writes in one bounded
15-second transaction. Payment review locks the same booking before deciding,
so approval and cancellation cannot both commit.

The completed BookingCancellation records the original reason, Customer actor,
CUSTOMER_REQUEST category, COMPLETED state, request/completion timestamps, zero
penalty rate/amount and isLateCancellation=false. reviewNotes holds the fixed
server policy identifier `unpaid-customer-v1`; reviewedByStaffId remains null.
This is automatic zero-fee cancellation, not a fabricated human review. A
matching replay returns the original reason and timestamps even if the supplied
reason changes. Another policy's record cannot be converted to this result.

The booking becomes CANCELLED with one transition and atomic in-app notification
rows for the Customer and eligible operators. Driver-linked operators are
excluded. Customer-visible results omit internal review notes/staff information.
The response includes policyVersion, penaltyAmount, penaltyRate and the original
cancellation state/timestamps. No resource-release command is needed or permitted
because an assigned or paid booking is ineligible for this path.

Pending receipt evidence is not deleted, automatically failed or treated as
refunded. Operators can reject it separately; approval against the cancelled
booking fails. No money is moved, refunded or written off. Historical approved
funds require a different workflow even if a booking state is inconsistent.

## Deployment and provider boundaries

This PR is stacked on the #63 booking-channel PR #70. It requires that reviewed
schema/client version but adds no further migration. Client generation succeeded
in the isolated worktree. No database migration or runtime mutation was executed.

The existing dev baseline has no enabled PayMongo checkout. Before merging the
pending checkout PR #67, coordinate cancellation with checkout creation and late
webhooks under the same booking lock. A booking with an active provider checkout
must not use this zero-refund cancellation path without an explicit provider-safe
resolution policy. This PR does not claim that integration is implemented or
that a remote payment can be cancelled by updating a local booking.

## User-run verification

Tests, HTTP/database suites, lint and build are not run. From this worktree:

```bash
npm test -- test/unit/unpaid-cancellations.service.spec.ts test/unit/payments.service.spec.ts
npm run test:e2e -- test/e2e/unpaid-cancellations.e2e-spec.ts test/e2e/booking-sales-channel.e2e-spec.ts
npm run lint
npm run build
```

Follow documentation/testing/manual-payments-postgres.md using only a fresh
disposable local database and the complete reviewed migration chain. The opt-in
suite includes actual competing cancellation/approval, duplicate owner requests,
cross-owner denial and rollback after an injected notification-write failure.
These cases are authored, not executed. The hosted test project was not used.
