# Booking domain migration runbook

**Current-state review:** October 27, 2026

The repository currently has one consolidated Prisma migration:

```text
prisma/migrations/000000000000_squashed_migrations/migration.sql
```

It represents the current public application schema, including profiles,
customers, staff, fleet, packages, quotes, bookings, route evidence, pricing,
payments, receivables, cancellations, refunds, outsourcing, maintenance, travel
slips, and notifications.

The migration creates public application objects only. Application migration
work must not create, alter, grant access to, or delete Supabase `auth` objects.
The `user_profile.user_id` relationship to `auth.users` must remain intact.

## Current evidence boundary

Earlier documentation recorded a successful non-production migration status on
October 4, 2026, before the repository migration history was squashed on
October 8. That earlier result proves the database state at that time; it does
not prove that the database's migration-history table is reconciled with the
current squashed migration name and checksum.

Before another migration deployment, capture fresh redacted evidence for:

- the current database migration-history rows;
- `pnpm prisma migrate status` against the approved non-production database;
- representative public tables, enums, indexes, and foreign keys;
- the existing `user_profile` row count and `auth.users` relationship; and
- successful login and profile access for an approved synthetic account.

Do not claim the squashed baseline is deployed merely because its schema looks
equivalent to the database.

## Reconciliation boundary

If the approved database records the former migration names while the repository
contains only the squashed baseline, stop before running `migrate deploy`.
Review the recorded names, checksums, and actual schema with the database owner
and prepare an explicit baselining or forward-migration procedure.

Do not:

- rename or edit migration-history rows casually;
- rerun the squashed migration against an already populated schema;
- create a duplicate migration that recreates existing tables or enums;
- use `migrate reset` on the shared Supabase database;
- use `db push --accept-data-loss`; or
- use broad schema synchronization as a substitute for reviewed migration
  history.

Any `prisma migrate resolve` action must name one exact migration and be backed
by reviewed evidence that the database schema already matches the intended
state. It must not be used to hide a partially applied or unknown migration.

## Pre-deployment checklist for future migrations

1. Use an approved non-production Supabase or Postgres environment.
2. Confirm `DIRECT_URL` points to that environment without printing or storing
   the value in documentation.
3. Confirm the squashed baseline and database migration history have been
   reconciled and documented.
4. Run `pnpm prisma validate` and `pnpm prisma generate` locally.
5. Run `pnpm prisma migrate status` and retain redacted output.
6. Review the new migration SQL for destructive operations, Supabase `auth`
   access, locking, backfill requirements, and rollback or forward-repair steps.
7. Take an environment backup or snapshot.
8. Run `pnpm prisma migrate deploy` only for the reviewed pending migration.
9. Run `pnpm prisma migrate status` again and execute representative schema and
   application checks.

## Deferred database safeguards

The current baseline intentionally does not provide database-level exclusion
constraints for overlapping vehicle and Driver schedules. Advisory availability
checks are not reservations. Add interval-based overlap protection only after
the reservation and active-assignment rules are approved.

The current model also needs reviewed retention rules before commercial and
operational workflows rely on records that can cascade when a Booking is
deleted.

## Evidence to retain

Keep redacted before-and-after migration status, deployment logs, schema checks,
and application smoke-test results. Never retain access tokens, connection
strings, API keys, real customer data, or unredacted location data in the
repository.

## Recovery

If deployment fails, stop further releases, preserve the Prisma error and
migration record, determine exactly which statements committed, and prepare a
reviewed forward-only corrective migration. Restore an approved backup when the
database owner determines it is required. Do not improvise destructive reset or
history edits against the shared environment.
