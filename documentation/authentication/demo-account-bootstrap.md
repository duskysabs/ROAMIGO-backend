# Demo Account Bootstrap

This procedure creates the non-production accounts required by the booking MVP demonstration.

## Safety boundary

- Run this procedure only against the approved non-production database.
- Do not set `NODE_ENV=production`.
- Do not commit `.env` files, user IDs, passwords, access tokens, or database URLs.
- Create the Supabase Auth user before running the Administrator bootstrap command.
- The public API cannot create `ADMIN`, `STAFF`, or `DRIVER` profiles.

## Maintainer notes

- Keep `POST /user-profiles/me/complete` protected by `SupabaseTokenGuard`. A
  user without a profile cannot pass `SupabaseAuthGuard`, because that guard
  loads the profile before allowing the request.
- Keep the completion DTO limited to Customer-owned profile fields. Do not add
  `role` or `accountStatus` fields to it.
- Keep the Administrator bootstrap as a non-production CLI command. Do not
  expose its behavior through a public or authenticated HTTP endpoint.
- If role management is added later, use a separately authorized Admin
  workflow with an audit trail rather than extending this demo command.

## Administrator

1. Create or identify the Administrator's Supabase Auth user in the non-production Supabase project.
2. Record only that user's UUID in the local environment, not in source control.
3. Set these local environment variables:

```text
ALLOW_DEMO_ADMIN_BOOTSTRAP=true
DEMO_ADMIN_USER_ID=<existing Supabase Auth user UUID>
DEMO_ADMIN_FIRST_NAME=<first name>
DEMO_ADMIN_LAST_NAME=<last name>
```

4. Run:

```bash
pnpm demo:bootstrap-admin
```

The command creates or updates one active `ADMIN` profile and its active `STAFF` record. It refuses production environments and refuses to replace a different existing Administrator.

## Customer

1. Register through `POST /auth/signup`.
2. Authenticate with the new Customer account.
3. Call `POST /user-profiles/me/complete` with:

```json
{
  "firstName": "Demo",
  "lastName": "Customer",
  "birthDate": "2000-01-02",
  "homeAddress": "Demo address"
}
```

The endpoint always creates an active `CUSTOMER` profile and customer record. It does not accept role or account-status fields. A second completion request returns a conflict and does not replace the existing profile.

## Reset

Use the non-production environment reset procedure from the booking MVP runbook. Do not manually alter roles in a shared or production database.
