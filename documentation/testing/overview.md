# Testing Overview

**Current-state review:** November 8, 2026

## Test levels

ROAMIGO has the following automated levels:

- Unit tests isolate services, guards, controllers, and business rules with
  mocks.
- HTTP-level tests start a NestJS application and use Supertest while mocking
  external and persistence boundaries.

A dedicated, opt-in local Postgres suite now covers manual-payment approval,
durable assignment requests and schedule constraints. See the
[database test runbook](./manual-payments-postgres.md). It has not been run in
this change. It does not replace the broader integration requirements below.

```text
test/
├── unit/
│   ├── authentication and profile tests
│   ├── booking and quote-lifecycle tests
│   ├── Booking Review tests
│   ├── catalog and fleet tests
│   └── pricing and routing tests
├── e2e/
│   ├── auth.e2e-spec.ts
│   ├── auth-throttling.e2e-spec.ts
│   └── user-profiles.e2e-spec.ts
└── app.e2e-spec.ts
```

## Current evidence

For the November 8 changes, source/diff review was performed. Tests, formatter,
lint, type checks, build and database migration execution were not run. The
results below are historical and do not validate the current revision.

On October 27, 2026, the merged Booking Review source passed:

- 63 unit tests across 14 files;
- 21 HTTP-level tests across 4 files;
- lint; and
- the NestJS build.

The HTTP-level tests use mocked application boundaries and placeholder
configuration. They do not prove Supabase connectivity, Prisma transactions,
migration compatibility, Geoapify availability, or real database constraints.

## Running checks

Generate the Prisma Client before compiling a clean checkout:

```bash
pnpm prisma generate
```

Then run:

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

HTTP-level tests open temporary localhost ports. Restricted execution
environments must allow loopback connections. Test configuration may use fake,
syntactically valid values only when the relevant boundary is mocked.

## Required integration-test boundary

The planned integration suite must use an isolated Supabase project or
Supabase-compatible Postgres database and must never point at production. It
should cover:

- migration application and schema checks;
- real profile and role persistence;
- authenticated quote, submission, list, detail, and ownership behavior;
- quote expiry, single use, and idempotency;
- Booking Review authorization and concurrent processing;
- transactional rollback and database constraints; and
- provider adapters through local stubs or recorded safe fixtures.

Cleanup must be deterministic, scoped to synthetic test data, and unable to
delete shared or production records.

## Test data and secrets

Tests must use clearly fake identities, tokens, and provider data. Never commit
real passwords, access or refresh tokens, database connection strings, provider
keys, customer information, or precise real-world travel data.

Module-specific documentation:

- [Authentication unit tests](./unit/authentication.md)
- [Authentication HTTP-level tests](./e2e/authentication.md)
- [Booking MVP test cases](./booking-mvp-test-cases.md)
