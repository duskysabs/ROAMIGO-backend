# Manual payment and assignment verification

## Current evidence

Source and diffs were reviewed. Tests, formatter, lint, type checks, build,
database setup and migrations were not run for the November 8 changes.
The commands here are for the user to run. No live PayMongo call is needed.

## Focused local checks

Regenerate the ignored client after schema changes, then exercise the affected
domain behavior and HTTP authorization/validation boundaries:

```bash
npx prisma generate --config prisma7.config.ts
npx vitest run test/unit/booking-quote-lifecycle.spec.ts test/unit/bookings.service.spec.ts test/unit/payments.service.spec.ts test/unit/assignments.service.spec.ts test/unit/fleet.service.spec.ts
npm run test:e2e -- test/e2e/payments.e2e-spec.ts
npm run lint
npm run build
```

Generation updates local generated files; it does not apply a database migration.
The focused suites use mocked persistence and do not establish database safety.
Lint checks source rules; the build regenerates the client and compiles the app.

## Disposable local database suite

Use a dedicated, newly created local PostgreSQL cluster/database for these
checks. Set ROAMIGO_TEST_DATABASE_URL to a local database whose name ends in
_test, and ROAMIGO_ALLOW_DATABASE_TESTS=yes. Do not use production, a shared
development database or a hosted database. The suite rejects non-local hosts,
other database names, missing opt-in and existing application profile records.

The local bootstrap creates only the auth.users identity stub and the anon and
authenticated NOLOGIN roles needed by the reviewed baseline. It must run only
on the disposable local cluster. The migration role needs extension and DDL
privileges. A production Supabase auth schema must never be recreated this way.

After configuring those environment variables and checking the target, run:

```bash
psql "$ROAMIGO_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f test/integration/bootstrap-local-postgres.sql
DIRECT_URL="$ROAMIGO_TEST_DATABASE_URL" npx prisma migrate deploy --config prisma7.config.ts
npm run test:postgres
```

The suite appends synthetic records and closes its connections. It does not
delete audit evidence or automatically drop databases. Recreate the disposable
database before the next complete run; rerunning against populated records is
rejected. These tests are excluded from npm test and npm run test:e2e.

Cases cover concurrent approval of one receipt, one durable request/decision,
immutable audit, deterministic ordering of overlapping paid requests, overlap
constraints outside the allocator, adjacent intervals and active resource guards.
HTTP tests are separate; this database suite does not prove hosted Supabase
authorization, real provider delivery or deployment behavior.

## Non-production migration preflight

Follow the existing squashed-baseline reconciliation runbook first. Do not
reset or rewrite hosted migration history. The new migrations are:

1. 202611080001_customer_booking_idempotency: customer/key uniqueness.
2. 202611080002_paid_awaiting_assignment: append the new booking enum value.
3. 202611080003_manual_payments_and_allocations: audit/request tables,
   reservation interval backfill, constraints, triggers and table permissions.

The enum addition is intentionally separate so PostgreSQL commits it before
later transactions use the new value. Reserved intervals are backfilled from
the authoritative booking. Check existing data before applying constraints:

```sql
SELECT booking_id, count(*)
FROM public.payment
WHERE payment_status IN ('PAID', 'CONFIRMED')
GROUP BY booking_id HAVING count(*) > 1;

SELECT a.booking_assignment_id, b.booking_assignment_id
FROM public.booking_assignment a
JOIN public.booking aa ON aa.booking_id = a.booking_id
JOIN public.booking_assignment b
  ON a.booking_assignment_id < b.booking_assignment_id
 AND (a.vehicle_id = b.vehicle_id OR a.driver_id = b.driver_id)
JOIN public.booking bb ON bb.booking_id = b.booking_id
WHERE a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')
  AND b.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')
  AND aa.start_datetime < bb.end_datetime
  AND bb.start_datetime < aa.end_datetime;

SELECT booking_id FROM public.booking WHERE start_datetime >= end_datetime;
```

Do not delete or silently adjust conflicting financial/schedule records. Resolve
them through an approved data review. The migration fails if existing data
violates the new invariants. The btree_gist extension must be available; hosted
extension placement/privileges should be checked by the database owner.

Payment/audit/request/assignment tables deny anon and authenticated direct access.
The backend uses its approved database identity. Verify those grants and role
behavior in the approved non-production environment. PostgreSQL exclusion,
partial-index, immutability and resource-guard rules are SQL-owned invariants
that Prisma schema syntax does not fully represent. Future migrations must
preserve them; do not use schema push as a substitute.

After migration and application rollout, rehearse receipt record, rejection,
verification, successful allocation, unavailable capacity, duplicate retry,
driver-linked operator denial and customer ownership. Record the exact revision
and actual results. Application merge alone does not deploy or verify migrations.
