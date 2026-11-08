# Automatic dispatch and Driver execution

Reviewed: November 8, 2026. Scoped delivery: #57 under #26, with initial recovery
and turnaround safety boundaries from #25/#28. Source implementation is not
runtime verification. Tests, lint, formatting, type checks, build, scheduler and
migrations were not run for this change.

## Proposal and approved policy

Figure 4.3 and REQ-ASG-05 specify automatic dispatch details and notifications
after assignment. A normal Staff release/dispatch approval is not required.
REQ-ASG-06 allows acknowledgement or decline within a configured window.

The approved default is two hours. Set DRIVER_RESPONSE_WINDOW_MINUTES to an
integer from 1 through 10080; it defaults to 120. Configuration is read at process
startup, so restart after changing it. Each dispatch stores its own UTC deadline;
changing configuration does not rewrite existing deadlines. The window starts
at dispatch and is not clipped to the scheduled pickup time. A response at or
after the deadline is rejected. Starting a trip additionally requires the
current time to be inside its scheduled start/end interval.

## Identity and access

Authentication loads a server-owned isDriver flag from the linked Driver record.
RolesGuard treats a linked identity as DRIVER even when UserProfile.role still
contains STAFF. This prevents inherited generic Staff, Admin and financial
access. A role label alone does not authorize trip data: every Driver service
operation also requires an active account/employment and a matching active
Driver record. Inactive Driver links do not restore broad Staff access.

The schema does not mass-convert existing STAFF role values. Clients can use
GET /auth/me and its server-returned isDriver flag to choose their interface.
No profile update accepts that flag from the client.

The migration enables RLS and revokes PUBLIC/anon/authenticated direct access on all
backend-owned public application tables. Supabase Auth remains unchanged.
Catalog and operational data must go through NestJS DTOs and authorization;
direct frontend Supabase table queries are no longer a supported access path.
The approved backend database identity must retain its existing privileged
application access. Rehearse both public catalog reads and protected records
after migration, and audit any existing explicit RLS policies or grants to
other database roles during deployment review.

## Endpoints

| Method and route | Result |
| --- | --- |
| GET /driver/me | Own Driver ID/status and designated vehicle |
| GET /driver/assignments?cursor=&limit= | Own dispatched assignments, newest first |
| GET /driver/assignments/:id | Own operational details |
| POST /driver/assignments/:id/acknowledge | Accept the assignment within its deadline |
| POST /driver/assignments/:id/decline | Decline with a reason, then attempt recovery |
| POST /driver/trips/:id/en-route | Record departure towards pickup |
| POST /driver/trips/:id/arrive | Record arrival |
| POST /driver/trips/:id/start | Start the arrived trip and create its travel slip/hold |
| POST /driver/trips/:id/complete | Store the completion snapshot and enter turnaround |
| GET /driver/trips/:id/navigation-link?stopSequence= | External Google Maps link for an approved stop |
| POST /staff/driver-responses/process-expired | Non-driver Staff/Admin: process a bounded overdue batch |
| GET /staff/trip-completions/:id | Non-driver Staff/Admin: completed authoritative snapshot |

IDs are assignment UUIDs. Lists default to 20 items, maximum 100, and return
items/nextCursor with stable assignedAt/ID ordering. Reads return 200; successful
commands return 201. Unauthenticated calls return 401, disallowed roles/profile
state return 403, unknown or another Driver's assignment returns 404, and stale
states, expired deadlines or operational holds return 409.

Action bodies accept only an optional reason, trimmed and 3 to 500 characters
when supplied. Decline requires it. Empty bodies are valid for other actions.
Client-supplied trip state, booking state, dates, price, payment fields and
location coordinates are rejected by DTO validation. The timeout body accepts
only limit (1 to 100, default 20). Navigation accepts an approved stop sequence,
default 1; the client cannot supply a destination coordinate or URL.

Driver DTOs contain schedule, passengers, vehicle identity and operational state.
Details include the current assigned route/stops and necessary Customer contact.
Closed/declined assignments omit route/contact. Lists omit contact and route.
No Driver endpoint returns a price, payment ledger, provider reference, refund,
receivable, staff audit evidence or full financial completion snapshot.
The navigation response is an external deep link, not in-app navigation, live
tracking or certification of the actual route travelled.

## State ownership and retries

The supported sequence is:

```text
Full payment -> internal assignment -> CONFIRMED -> automatic DISPATCHED
Driver: DISPATCHED -> ACKNOWLEDGED -> EN_ROUTE -> ARRIVED -> STARTED -> ENDED
Booking: DISPATCHED ----------------------------> IN_PROGRESS -> COMPLETED
```

AssignmentStatus remains ASSIGNED until acknowledgement, then ACKNOWLEDGED until
completion. Trip progress is stored separately as tripState. Each action has one
immutable DriverEvent, keyed by assignment/action. A matching retry returns
current state without repeating side effects; a later reason does not overwrite
the original event. Illegal predecessors are rejected. Commands are serialized
with the same allocation lock and booking/assignment row locks used by recovery.

Dispatch time/deadline, its system event, booking transition and the Driver and
Customer notification rows are committed atomically. Notification delivery is
not implemented by storing a row; the general inbox/delivery/outbox remains
#24/#29. No remote push, email or SMS receipt is claimed.

Decline and non-response preserve the old assignment as DECLINED, with tripState
DECLINED or EXPIRED. The booking enters RECOVERY_REQUIRED, distinct from
pre-confirmation BOOKING_REVIEW and initial PAID_AWAITING_ASSIGNMENT. Its durable
assignment request is reopened with isRecovery=true. Internal replacement uses
the same eligibility/overlap rules and excludes every Driver who already
declined or timed out for that booking. A partial unique index permits one
active assignment per booking while retaining older rows.

If no replacement is eligible, the request stays in the Staff allocation queue
and operators receive an in-app notification record. Successful replacement
automatically dispatches again with a new deadline and system audit. No booking
price or payment state changes. Breakdown, acknowledged-driver withdrawal,
authorized overrides and outsourced fulfilment still require the wider #25
recovery workflow.

## Completion and turnaround

En-route/arrival/start require available resources without an active hold.
Start validates licence validity and scheduled time, creates an IN_TRIP hold,
sets both resources IN_TRIP and creates the travel slip atomically.

Completion stores a versioned server-owned Trip Completion Record in
TravelSlip.completionSnapshot before exposing COMPLETED. It retains booking,
assignment, Driver/vehicle, approved stored stops, quote route evidence, trip
timestamps, current stored stop-charge/payment state and optional notes. It
does not invent revised totals, paid balances or consent that is not present.
No signature or Driver-entered odometer is required (REQ-TRP-01 through 04).
Completed travel slips and Driver events reject ordinary update/delete at the
database layer. Driver views show operational completion fields; financial
snapshots are restricted to authorized non-driver Staff/Admin readers.

Completion moves the hold and both resources to TURNAROUND. The hold blocks all
new allocation, even after the reserved trip interval has ended. Database guards
reject ordinary availability/pairing/account changes that bypass the active
hold. Required cleaning/inspection/refuelling reports, defects, configured release
conditions and automatic release are not implemented here. Those are #28.
There is deliberately no shortcut release endpoint; a completed resource stays
blocked until that authorized lifecycle is implemented.

## Timeout processing and deployment

Reads never expire assignments or trigger recovery. A trusted server job is
provided:

```bash
npm run driver:expire-responses
```

Configure the deployment scheduler to run it regularly, for example once per
minute, using the approved backend environment. One run processes up to 100
overdue assignments. Larger backlogs need repeated runs. Multiple runners are
safe because each item is locked and rechecked. The command is not started or
scheduled by merging this code. Without a configured runner or authorized Staff
batch invocation, late acknowledgement is rejected but recovery waits for a
processor. Monitor scheduler failures and the recovery queue.

The job is a trusted application entry point with backend database credentials;
it does not expose a public unauthenticated endpoint or accept credentials in a
URL. Expiry events use SYSTEM with no fabricated human actor. The Staff HTTP
entry point performs the normal account/employment/non-driver permission checks.

## Migration and user-run verification

Apply 202611080004_driver_recovery_state before
202611080005_driver_dispatch_execution, following existing baseline preflight.
The latter retains assignment history, adds dispatch/events/holds/snapshots and
updates resource guards. Preserve the SQL-only partial indexes, actor checks,
immutability triggers and existing separate vehicle/Driver exclusion rules.
Do not substitute schema push for those migrations.

Older assignments initially have no dispatch timestamp/deadline and are not
shown as newly dispatched to a Driver. An authorized allocation retry can
dispatch an older CONFIRMED/ASSIGNED booking with an existing completed request,
after rechecking eligibility while excluding its own reservation. It does not
reset the deadline of an already dispatched assignment. Other legacy states or
missing request records require explicit data review; no automatic backfill
claims that a Driver was notified earlier.

Run generation and focused checks from the backend:

```bash
npx prisma generate --config prisma7.config.ts
npx vitest run test/unit/dispatch-policy.spec.ts test/unit/driver.service.spec.ts test/unit/assignments.service.spec.ts test/unit/auth.service.spec.ts test/unit/roles.guard.spec.ts test/unit/fleet.service.spec.ts
npm run test:e2e -- test/e2e/driver.e2e-spec.ts test/e2e/payments.e2e-spec.ts
npm run lint
npm run build
```

Use the existing [isolated Postgres runbook](../testing/manual-payments-postgres.md)
for database setup. That suite now also includes owned Driver reads,
decline/replacement history, system timeout events and completion holds. These
cases are authored, not executed. Rehearse actual notifications, job scheduling,
concurrent response/timeout and completion in non-production before release.
