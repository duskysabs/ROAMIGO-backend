# Manual payments and initial assignment

Reviewed: November 8, 2026. Baseline: dev. Scoped delivery: #55 under #16 and #17.

## Approved scope

Full payment in PHP is required before assignment. Active Administrators and
active non-driver Staff can record and verify received funds. A Staff profile
with any linked Driver record is excluded, including an inactive Driver record.
Authorization is checked by the service as well as the route guards. No
accounting-specific permission exists yet. These permissions do not create a
driver trip API.

The new operator gate applies to payment and allocation queues. Older generic
STAFF fleet and Booking Review routes still need a role-scope audit when the
driver identity boundary is implemented.

This version records staff-entered receipt evidence. Customer proof upload,
storage/signing, deposits, online checkout, PayMongo callbacks, payment expiry,
refunds and external-resource fulfilment are separate work. KYC onboarding does
not verify a booking payment. Live provider capabilities are not inferred from
account creation.

## Routes

| Method and route | Access and result |
| --- | --- |
| POST /staff/bookings/:bookingId/payments/manual | Non-driver Staff/Admin: record a pending full-payment receipt |
| GET /staff/payment-reviews?cursor=&limit= | Non-driver Staff/Admin: pending receipts and entered evidence |
| POST /staff/payment-reviews/:paymentId/approve | Non-driver Staff/Admin: verify receipt, persist payment and allocation request |
| POST /staff/payment-reviews/:paymentId/reject | Non-driver Staff/Admin: reject pending evidence without changing the booking |
| GET /bookings/:bookingId/payments?cursor=&limit= | Customer-owned payment page; another customer's booking returns 404 |
| GET /staff/assignment-requests?cursor=&limit= | Non-driver Staff/Admin: pending requests, attempts, safe failure category |
| POST /staff/assignment-requests/:bookingId/retry | Non-driver Staff/Admin: retry a durable request |

UUID route parameters are validated. Mutation routes return 201 on success.
Payment pages and Staff queues default to 20 items, maximum 100; cursor values are payment IDs or
booking IDs respectively. Ordering is creation time then ID; allocation queue
ordering uses original booking creation time then booking ID. Empty queues
return an empty items array and null nextCursor.

Record body:

```json
{
  "method": "BANK_TRANSFER",
  "reference": "RECEIPT-0001",
  "amount": "1200.00",
  "reason": "Receipt entered for verification"
}
```

Methods: BANK_TRANSFER, E_WALLET, CASH or OTHER. References are trimmed and
uppercased, 3 to 100 characters, restricted to letters, digits, dot, underscore,
colon, slash and hyphen, with an initial letter or digit. Cash needs a receipt
number. Amounts are positive fixed two-decimal strings and must exactly equal
the server's full quoted price. Currency is server-owned PHP. Receipt reference
uniqueness is scoped by manual payment method across bookings.

Approval/rejection body:

```json
{ "reason": "Received funds matched against the payment channel statement" }
```

Reasons are trimmed, 3 to 500 characters. Unknown fields, including supplied
payment status or booking status, are rejected. Actual receipt verification
occurs outside this software before the operator approves. A reference, note or
screenshot alone never automatically marks a booking paid.

## Idempotency and evidence

Re-recording the same method/reference, booking and amount returns the original
payment, including its current review state. Reuse for different booking/amount
returns 409. The original reason is retained. The same resolved decision can be
retried; the opposite decision returns 409. The original decision actor, role,
time and reason remain immutable. There is no ordinary payment edit endpoint.

Verification locks the booking before re-reading and changing its payment.
Exactly one paid/confirmed full receipt per booking is enforced by a partial
unique index. Pending or failed receipts never confirm the booking. Failed
evidence does not establish that funds were refunded.

Customer summaries include payment ID, booking ID, channel, method, amount,
currency, state and timestamps. They omit staff identities, reasons, bank
references and proof locations. Staff review queues include the recorded
reference and audit evidence needed for verification.

## Lifecycle and durable handoff

| Trigger | Booking state | Payment state | Assignment |
| --- | --- | --- | --- |
| Receipt recorded | AWAITING_PAYMENT | PENDING | None |
| Evidence rejected | Unchanged | FAILED | None |
| Full receipt approved | PAID_AWAITING_ASSIGNMENT | PAID | Durable request committed |
| Eligible internal pair allocated | CONFIRMED | PAID | ASSIGNED |
| Capacity unavailable or allocation failure | PAID_AWAITING_ASSIGNMENT | PAID | Request stays pending |

Payment approval and its audit, booking transition and assignment request are
one transaction. Allocation happens after that commit in a separate transaction.
A process crash or allocation error cannot erase received payment evidence.
There is no background poller in this slice. Staff can inspect pending requests
and retry them. Retrying approval also retries allocation without another payment
decision. This is a specific durable command handoff, not the general outbox in
#24.

Assignment uses a transaction-scoped advisory lock, booking/readiness row locks,
a fresh eligibility query and separate vehicle/driver exclusion constraints.
Eligibility includes type, capacity, undeleted/available vehicle, designated
available Driver, active employment/account, licence through trip end, schedule
and unresolved maintenance. Scheduled maintenance on or before the trip end
date blocks allocation conservatively; in-progress maintenance always blocks.
The current date-based policy uses UTC, matching existing licence handling.

Both reservation intervals are copied from the booking. Intervals are half-open:
an end at 10:00 does not overlap a start at 10:00. Readiness status describes the
resource, while assignments describe time-specific reservations; a future
assignment does not globally block the resource from non-overlapping bookings.

Older paid, pending requests of the same vehicle type with overlapping times
take priority by immutable original booking creation time and then ID. This can
leave a later booking pending even when an older request needs manual recovery.
It is deliberately conservative and is not a complete fair-scheduling policy
for unpaid requests or mixed-capacity optimization. The global allocation lock
also limits allocation throughput and should be revisited with measured load.

Failure categories include NO_ELIGIBLE_PAIR, EARLIER_PAID_BOOKING_PENDING,
OUTSOURCED_FULFILMENT_REQUIRES_REVIEW, TRIP_INTERVAL_ELAPSED,
FULL_PAYMENT_REQUIRED, BOOKING_STATE_CHANGED and RETRY_REQUIRED. Unhandled
database conflicts return RETRY_REQUIRED while preserving the durable request;
their rolled-back attempt does not increment the durable attempt count.

Outsourced bookings remain paid-awaiting-assignment for Staff follow-up. They
must not acquire an internal pair automatically or be presented as dispatched.

## Remaining boundaries

Active resource and booking schedule changes are guarded in the database;
ordinary fleet status/pairing commands also check active assignments. A racing
change may be rejected by the database. Full recovery and a uniform mapping of
all adapter constraint errors to application conflicts remain part of #23/#25.
Do not bypass those guards to resolve an operational issue.

Preparation buffers, complete document/readiness history, turnaround, assignment
replacement/history, deadlines, generalized transition policy, system actors,
outbox delivery and driver acknowledgement/start/completion remain separate.
Current BookingAssignment still has one row per booking, which needs redesign
before preserving multiple replacement assignments. No production-readiness or
real-database verification claim is made by the presence of these endpoints.
