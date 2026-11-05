# Staff Administration API Contract

## Boundary

Staff Administration is an Administrator-only workflow for turning an existing
Supabase Auth account into a ROAMIGO Staff account. It removes the need to add
`user_profile` and `staff` rows manually in the Supabase Table Editor.

This module does not create Supabase Auth accounts with a service-role key. A
prospective employee first uses `POST /auth/signup`. The Administrator then
uses the returned Auth `user.id` when creating the Staff profile.

## Authorization

Every endpoint under `/admin/staff` requires an authenticated `ADMIN` profile.
Customer, Staff, and Driver roles are forbidden.

## Onboarding

### Create Staff profile

`POST /admin/staff`

```json
{
  "userId": "supabase-auth-user-uuid",
  "firstName": "Mina",
  "lastName": "Santos",
  "phoneNumber": "+639171234567",
  "birthDate": "1998-04-12",
  "homeAddress": "Baguio City"
}
```

The referenced Supabase Auth user must exist and must not already have an
application profile. The API creates both records atomically:

- an active `user_profile` with the fixed role `STAFF`; and
- an active `staff` employment record.

The caller cannot choose a privileged role or initial account/employment
status. Existing Customer, Staff, Driver, or Administrator profiles are never
silently converted.

## Reads

### List Staff

`GET /admin/staff`

Query parameters:

- `search`: first name, last name, or phone number.
- `employmentStatus`: `ACTIVE`, `INACTIVE`, or `SUSPENDED`.
- `accountStatus`: `ACTIVE` or `INACTIVE`.
- `hasDriver`: `true` or `false`.
- `page`: positive integer; default `1`.
- `limit`: `1`–`100`; default `20`.

The response contains `data` and pagination `meta`. Staff responses include the
application profile and, when present, the Driver and designated vehicle.

### Staff detail

`GET /admin/staff/:staffId`

## Profile maintenance

`PATCH /admin/staff/:staffId/profile`

The Administrator may update names, phone number, birth date, and home address.
Role, account status, and employment status are not accepted by this endpoint.
At least one profile field is required.

## Employment lifecycle

`PATCH /admin/staff/:staffId/employment-status`

```json
{
  "employmentStatus": "SUSPENDED"
}
```

- `ACTIVE` makes the Staff application account active.
- `SUSPENDED` and `INACTIVE` make the application account inactive, so existing
  or newly issued Supabase tokens cannot enter the application through the
  authenticated guards.
- Records are retained; Staff accounts are not physically deleted.

If the Staff member is also a Driver, suspension or deactivation:

- is rejected while the Driver has an active booking assignment;
- makes the Driver `INACTIVE`;
- removes the designated vehicle pairing; and
- makes the formerly paired vehicle `UNAVAILABLE`.

Reactivating Staff employment restores application access but deliberately does
not make a Driver available or restore a former vehicle pairing. Fleet staff
must review the licence, pair the Driver, and restore operational statuses.

## Database boundary

The existing schema already supports this workflow. No Prisma schema migration
is required for Staff Administration.
