# Authentication and Customer Onboarding

**Current-state review:** October 27, 2026

## Overview

ROAMIGO uses Supabase Authentication for accounts, passwords, sessions, and
tokens. NestJS owns the public authentication contract, request validation,
application-profile checks, and role authorization. Prisma owns application
profiles and domain data; it never stores passwords or issues tokens.

```text
Supabase Auth -> accounts, passwords, sessions, and tokens
NestJS       -> endpoints, validation, onboarding state, and authorization
Prisma       -> profiles, roles, account state, and application data
```

## Implemented endpoints

| Method | Endpoint | Purpose | Access |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | Create a Supabase account and return the next onboarding step | Public, rate limited |
| `POST` | `/auth/login` | Authenticate and return either application or profile-completion state | Public, rate limited |
| `GET` | `/auth/me` | Return the authenticated user and active application profile | Active profile required |
| `POST` | `/user-profiles/me/complete` | Create the caller's active Customer profile and Customer record | Valid Supabase token; profile not required yet |
| `PATCH` | `/user-profiles/me` | Update the caller's profile fields | Active profile required |
| `GET` | `/user-profiles` | List application profiles | Administrator only |

Public callers cannot choose a role or account status. Customer profile
completion always creates role `CUSTOMER` with account status `ACTIVE`.
Privileged demo profiles use a separate guarded non-production bootstrap
workflow.

## Signup and resumable onboarding

`POST /auth/signup` accepts a normalized email address and a password between
8 and 128 characters. The response reports one of two next steps:

- `CONFIRM_EMAIL` when Supabase requires email confirmation and returns no
  session; or
- `COMPLETE_PROFILE` when a session is available.

A Supabase account may therefore exist before its application profile. This is
an intentional resumable boundary, not a completed application registration.

After obtaining a session, the client calls:

```http
POST /user-profiles/me/complete
Authorization: Bearer ACCESS_TOKEN
```

The endpoint accepts Customer profile fields only. It rejects an existing
profile rather than replacing it. Until completion succeeds, full
profile-protected routes remain unavailable.

## Login behavior

`POST /auth/login` first authenticates through Supabase, then loads the Prisma
profile:

- active profile: returns the session with `nextStep: APPLICATION`;
- missing profile: returns the session with `requiresProfile: true` and
  `nextStep: COMPLETE_PROFILE`; and
- inactive profile: signs out the newly created session and returns
  `403 Forbidden` without exposing tokens.

The strict login/signup limiter allows five attempts per client IP in a
60-second window and blocks for 60 seconds. Its current in-memory state is
process-local and must use shared storage before horizontally scaled deployment.

## Authentication guards

Two guard boundaries exist:

- `SupabaseTokenGuard` validates a Supabase access token without requiring an
  existing application profile. Profile completion uses this guard.
- `SupabaseAuthGuard` validates the token, requires a profile, and requires the
  profile to be active. Normal private application routes use this guard.

`@Roles(...)` applies authentication and role authorization together. A missing
or invalid token returns `401`; a missing, inactive, or disallowed application
profile returns `403` where appropriate.

Both guards currently require the exact case-sensitive `Bearer ` prefix.
Case-insensitive scheme parsing and shared malformed-header validation remain
planned hardening work.

## Validation status

Signup currently:

- trims and lowercases email addresses;
- validates email format;
- caps email length at 254 characters; and
- requires passwords between 8 and 128 characters.

Login validates email format and a non-empty string password, but still needs
equivalent normalization and maximum-length rules.

## Environment variables

The running authentication service uses:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=
```

Migration tooling may also require `DIRECT_URL`. Secrets and connection strings
must never be exposed to clients, logged, or committed. Explicit startup
configuration validation remains pending.

## Current test evidence

The automated suite covers signup responses, active and incomplete-profile
login, inactive-account rejection, token guards, role enforcement, profile
completion, duplicate protection, input validation, and rate limiting.

On October 27, 2026, the current merged source passed 63 unit tests and 21
HTTP-level tests. Those HTTP tests mock application boundaries and do not prove
real Supabase or Postgres integration.

## Remaining work

- Startup configuration validation
- Login normalization and input bounds
- Case-insensitive and unambiguous Bearer parsing
- Token refresh
- Logout and session-revocation policy
- Password recovery and email-change flows
- Production email confirmation and redirect configuration
- Real isolated Supabase/Postgres integration coverage

See [Authentication Work Plan](./auth-work-plan.md) for task-level details.
