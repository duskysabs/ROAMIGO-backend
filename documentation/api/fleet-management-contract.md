# Fleet Management API Contract

## Boundary

Fleet management is payment-independent. Administrators maintain vehicle and
Driver master data. Staff and Administrators can inspect fleet readiness,
change operational statuses, and manage the designated one-to-one
Driver–vehicle pairing.

Driver onboarding requires an existing active `Staff` record. Authentication
account and Staff-profile creation belong to the separate Staff-management
module.

## Authorization

- `ADMIN`: all fleet reads and writes.
- `STAFF`: fleet reads, operational status changes, pairing, and availability.
- Other roles: forbidden.

## Staff and Administrator operations

### List vehicles

`GET /staff/vehicles`

Query parameters:

- `search`: plate, model, color, or designated Driver licence.
- `status`: `VehicleStatus` value.
- `vehicleTypeId`: UUID.
- `page`: positive integer; default `1`.
- `limit`: `1`–`100`; default `20`.
- `includeDeleted`: only Administrators may set this to `true`.

The response contains `data` and pagination `meta`.

### Vehicle detail

`GET /staff/vehicles/:vehicleId`

Deleted vehicles are visible only to Administrators.

### List and inspect Drivers

- `GET /staff/drivers`
- `GET /staff/drivers/:driverId`

Driver list filters are `search`, `status`, `page`, and `limit`.

### Operational statuses

- `PATCH /staff/vehicles/:vehicleId/status`
- `PATCH /staff/drivers/:driverId/status`

A Driver can become `AVAILABLE` only with an active Staff profile, active user
account, unexpired licence, and designated active vehicle. A vehicle can become
`AVAILABLE` only after its designated Driver is available and eligible.

### Pairing

`PUT /staff/vehicles/:vehicleId/designated-driver`

Pair with `{ "driverId": "uuid" }`; unpair with `{ "driverId": null }`.
The schema's unique foreign key enforces one vehicle per Driver. The API returns
`409 Conflict` instead of silently moving an already-paired Driver or replacing
a vehicle's current Driver.

### Availability

`GET /staff/fleet/availability`

In addition to vehicle, Driver, employment, capacity, status, and schedule
checks, the Driver licence must remain valid through the requested trip end
date.

## Administrator master-data operations

### Vehicles

- `POST /admin/fleet/vehicles`
- `PATCH /admin/fleet/vehicles/:vehicleId`
- `DELETE /admin/fleet/vehicles/:vehicleId`

New vehicles start `UNAVAILABLE`. Delete is a soft delete: the vehicle becomes
`INACTIVE`, its pairing is removed, and any available paired Driver becomes
`UNAVAILABLE`. Vehicles with active booking assignments cannot be edited in a
way that changes their type/capacity or be deleted.

### Drivers

- `POST /admin/fleet/drivers`
- `PATCH /admin/fleet/drivers/:driverId`
- `POST /admin/fleet/drivers/:driverId/deactivate`

New Drivers start `UNAVAILABLE`. The Staff record must be active, have an active
user account with the `STAFF` role, and not already have a Driver record.
Licence numbers are normalized to uppercase and are database-unique. Driver
deactivation removes the pairing and makes the paired vehicle unavailable.
Drivers with active booking assignments cannot be deactivated or unpaired.

## Database migration

`20261027000000_unique_driver_license_number` creates a unique index on the
existing licence-number column without rewriting existing records. PostgreSQL
rejects the migration if exact duplicate values already exist. Apply it only
after reviewing hosted data and following the database migration runbook.
