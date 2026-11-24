# Audited booking master-data management

Issue: #22. This extends the existing package/pricing APIs and adds vehicle-type
administration. It does not add frontend screens or a general audit-query API.

## Vehicle categories

| Route | Permission and body |
| --- | --- |
| GET /admin/vehicle-types | Active non-driver Admin; all supported stored categories, including inactive records |
| POST /admin/vehicle-types | Admin; `{ "vehicleType": "VAN" }`; new record starts inactive |
| PATCH /admin/vehicle-types/:vehicleTypeId | Admin; `{ "isActive": true }` or false; UUID required |

Categories use the existing SEDAN, SUV, VAN, MINIBUS and BUS enum. Creating an
already-stored category returns 409. This is not an arbitrary-category editor.
Category identity is immutable through these APIs; no deletion or renaming API
is provided. Capacity remains a property of actual fleet vehicles, not a new
category-level promise or client-supplied availability fact.

Customer booking options return only active categories with undeleted vehicles,
using the existing id/name/maximumPassengerCapacity projection. New quotes and
submissions reject inactive categories at selection validation. Deactivation is
catalog withdrawal, not operational resource cancellation: historical booking
category IDs and snapshots remain intact, and existing paid assignment/recovery
keeps using the existing fleet eligibility rules. Do not claim that deactivation
recalls a Driver or cancels a booking.

## Package and pricing boundaries

Existing endpoint URLs, successful response shapes and frontend mutation bodies
are retained. Staff can read package management records; only Admin can mutate.
Package and pricing commands now receive the authenticated actor explicitly and
verify account, role and Driver linkage inside their write transaction. Admin
package/pricing reads and vehicle-type administration also check eligibility at
the data boundary. Customer catalogs remain public DTOs, not private audits.

Package writes lock their record before reading before/after state. Ordered route
replacement and its audit commit together. Activation revalidates the pickup and
dropoff structure; routes contain 2 to 30 stops. Existing booking route snapshots
are never rewritten. Replaying an unchanged status produces no additional audit.

Pricing creation retains server-controlled inactive status. Activation locks the
vehicle category before checking overlaps so two rows cannot concurrently pass
the service check. The existing inclusive effective-period conflict policy is
preserved. Audit/actor updates happen atomically with the status change. Direct
database administrative writes are outside the application service guarantee.

## Immutable mutation evidence

MasterDataAudit stores actorUserId, actorRole, recordType/ID, action, a server-owned
command reason, before/after JSON snapshots and occurrence time. CREATE records
have null before state. Snapshots contain master-data fields and ordered package
stops, never Auth credentials, tokens, payment proofs or raw provider payloads.
Server reasons describe the requested operation; this change does not fabricate
a human free-text explanation or claim to record an unsupplied business reason.

The audit insert uses the same transaction as each package/pricing/category write.
Audit failure rolls the write back. An append-only SQL trigger rejects updates and
deletes. Row-level security and revoked anon/authenticated privileges prevent
direct shared-role access. There is no public audit endpoint. Audits cannot be
used as an alternative mutation path. A general authorized audit reader remains
part of #30, outside this master-data scope.

## Migration and compatibility

202611240001_master_data_audit adds vehicle_type.is_active with default true to
preserve existing catalogs, and creates the new audit table/index/trigger and
restricted grants. Existing master-data changes are not backfilled with invented
actors or snapshots. Apply the reviewed migration before deploying this client.
No migration was applied during implementation; hosted project state is unchanged.
Take a backup and rehearse the complete migration chain on a disposable database.

This schema change needs an updated generated Prisma Client. Existing Admin
frontend bodies do not need new fields. Its customer-catalog lookup intentionally
continues to exclude inactive categories; a dedicated vehicle-type Admin editor
would use the new management route and is not implemented in this backend PR.

## Verification

Prisma Client generation and source/whitespace review completed. Unit, HTTP,
database suites, lint, type checking and build are not run. No live endpoint or
hosted database mutation was performed. From work/issue22-master-data:

```bash
npm test -- test/unit/master-data.service.spec.ts test/unit/tour-packages.service.spec.ts test/unit/bookings.service.spec.ts test/unit/location-routing.service.spec.ts
npm run test:e2e -- test/e2e/master-data.e2e-spec.ts
npm run lint
npm run build
```

The existing opt-in Postgres suite includes authored package audit rollback and
immutability, historical route preservation, category visibility and competing
pricing activation cases. Follow ../testing/manual-payments-postgres.md on a
fresh local disposable database. Authored cases are not executed evidence.

Requirements covered by the proposed source: server permissions, active customer
catalogs, atomic ordered routes, historical snapshot preservation, restricted
deletion, typed pricing boundary and actor/before/after evidence. Full issue
closure still requires passing checks, migration/persistence evidence and review.
