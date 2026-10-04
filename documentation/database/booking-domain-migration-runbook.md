# Booking domain migration runbook

This migration adds the public booking-domain tables after the committed
`20260914004329_init_user_profile` baseline. It deliberately does not create,
alter, grant access to, or delete any Supabase `auth` object. The existing
`user_profile` table and its `auth.users` foreign key remain owned by the
earlier baseline and Supabase integration.

## Review boundary

`20261004143000_booking_domain` creates the domain entities represented in
`prisma/schema.prisma`: customer and staff profiles, fleet, packages, bookings
and stops, pricing records, payments, receivables, cancellations, refunds,
outsourcing, maintenance, travel slips, and notifications. It preserves the
schema's UUID foreign keys, decimal precision, unique keys, timestamps, and
delete actions.

The migration intentionally does not add PostgreSQL exclusion constraints for
driver or vehicle schedule overlap. Assignment is not in the initial booking
demo flow, and overlap protection requires a later migration once the
reservation interval and active assignment statuses are finalized.

## Pre-deployment checklist

1. Use an approved non-production Supabase or Postgres environment with the
   `auth.users` table and the existing `user_profile` baseline already applied.
2. Confirm `DIRECT_URL` points to that environment. Never commit its value.
3. Run `pnpm prisma migrate status` and confirm only
   `20261004143000_booking_domain` is pending.
4. Take an environment backup or snapshot before applying the migration.
5. Run `pnpm prisma migrate deploy` and then `pnpm prisma migrate status`.
6. Run `pnpm prisma generate` so the generated client follows the committed
   schema, then verify an existing user profile and auth login still work.

## Evidence to retain

Record redacted before-and-after migration status, the deployment log, and
queries confirming `user_profile` row counts are unchanged. Confirm that all
new public tables exist and that no `auth` table or `user_profile` constraint
was changed.

## Recovery

Do not run `migrate reset`, `db push --accept-data-loss`, or a broad Supabase
schema synchronization. If deployment fails, stop further releases, preserve
the Prisma error and migration record, restore the approved backup when needed,
and prepare a forward-only corrective migration. Manual schema changes require
review against both this migration and `prisma/schema.prisma` before any
`migrate resolve` action.
