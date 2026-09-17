# Authentication Work Plan

## Purpose

This file is the source of truth for the ROAMIGO authentication and authorization
work. Update the status and notes here as each task is completed.

## Current Implementation

The backend currently provides:

- Password login through Supabase Auth: `POST /auth/login`
- Access-token verification through Supabase Auth
- Current-user endpoint: `GET /auth/me`
- Prisma-backed user profiles
- Application roles: `ADMIN`, `CUSTOMER`, `STAFF`, and `DRIVER`
- Application account states: `ACTIVE` and `INACTIVE`
- Authentication and role guards
- DTO validation with a global `ValidationPipe`
- Row-level security and revoked direct client access to `user_profile`

Baseline verification on 2026-09-17:

- Build passes
- Lint passes
- 13 existing tests pass

## Work Queue

### AUTH-01: Enforce account state during login

**Priority:** Critical  
**Status:** Completed on 2026-09-17

Login currently returns valid Supabase access and refresh tokens before checking
whether the application profile exists or is active. The profile and account-state
checks currently happen only when a guarded endpoint is accessed.

Required work:

- Load the user's profile after Supabase validates the credentials.
- Do not return tokens when the profile is missing.
- Do not return tokens when `accountStatus` is not `ACTIVE`.
- Decide whether missing profiles should return `403 Forbidden` or a generic login
  failure response.
- Define how disabling an application account affects existing Supabase sessions.
- Add unit and HTTP-level tests for missing and inactive profiles.

Acceptance criteria:

- An active user with a profile can log in.
- A missing-profile or inactive user receives no tokens.
- Protected endpoints continue rejecting inactive users even if they possess an
  older token.

Implementation notes:

- Login now loads the Prisma profile before returning authentication tokens.
- Missing-profile and inactive-account logins sign out the newly created Supabase
  session and return `403 Forbidden` without exposing its tokens.
- Existing protected-route checks remain in place for previously issued tokens.
- Unit coverage verifies active, missing-profile, and inactive-account login paths.
- HTTP coverage verifies missing-profile and inactive-account response statuses.

### AUTH-02: Add login rate limiting

**Priority:** High  
**Status:** Completed on 2026-09-17

Required work:

- Add application-level request throttling.
- Apply a strict limit to `POST /auth/login`.
- Choose limits suitable for development, testing, and production.
- Return `429 Too Many Requests` when the limit is exceeded.
- Account for trusted proxies before using forwarded client IP addresses.
- Add tests for allowed and throttled requests.

Acceptance criteria:

- Repeated login attempts from one client are bounded.
- Normal API traffic is not accidentally subjected to the strict login limit.

Implementation notes:

- `POST /auth/login` permits five attempts per client IP in a 60-second window,
  followed by a 60-second block.
- Throttling is attached only to the login route; unrelated endpoints do not use
  the strict login policy.
- The default tracker uses Express `request.ip`. Forwarded IP headers are not
  trusted unless the application is explicitly configured for a known proxy
  topology, preventing clients from bypassing the limit with spoofed headers.
- The in-memory store is process-local. Replace it with shared storage before
  running multiple API instances that must enforce one combined limit.
- HTTP tests verify the five allowed attempts, the subsequent `429 Too Many
Requests`, and that unrelated routes remain unaffected.

### AUTH-03: Add registration and profile provisioning

**Priority:** High  
**Status:** Not started

No current workflow guarantees that a Supabase user has a corresponding Prisma
`UserProfile`.

Required work:

- Define whether registration is public, invitation-only, or administrator-only.
- Create the Supabase account and matching profile as one coordinated workflow.
- Never allow public callers to choose privileged roles or active status.
- Handle partial failure and retries without producing duplicate or orphaned users.
- Decide whether profile creation uses a backend endpoint, database trigger, or
  trusted Supabase webhook.
- Add validation and tests.

Acceptance criteria:

- Every successfully registered user has exactly one profile.
- A failed profile creation does not leave an account that appears usable.
- Public registration cannot create `ADMIN`, `STAFF`, or `DRIVER` privileges.

### AUTH-04: Add token refresh

**Priority:** High  
**Status:** Not started

Required work:

- Add a refresh endpoint or document that clients must refresh directly through
  Supabase.
- Validate refresh tokens and return a rotated session.
- Recheck profile existence and account status before returning refreshed tokens.
- Define refresh-token storage for browser and mobile clients.
- Add success, invalid-token, expired-token, and inactive-account tests.

Acceptance criteria:

- Valid sessions can be renewed safely.
- Inactive or missing-profile users cannot renew application access.

### AUTH-05: Add logout and session revocation

**Priority:** High  
**Status:** Not started

Required work:

- Add logout behavior for the current session.
- Decide whether password changes, account deactivation, and security incidents
  revoke one session or all sessions.
- Do not treat client-side token deletion as server-side revocation.
- Add tests for logout and rejected revoked sessions.

Acceptance criteria:

- A logged-out session can no longer be used where immediate revocation is
  expected.
- Administrative deactivation has a documented session-revocation policy.

### AUTH-06: Add password and email lifecycle flows

**Priority:** Medium  
**Status:** Not started

Required work:

- Forgot-password request flow
- Password reset completion flow
- Authenticated password change
- Email change and confirmation
- Production email confirmation and redirect URL configuration
- Non-enumerating public responses where appropriate
- Tests for valid, invalid, expired, and reused recovery links

Acceptance criteria:

- Users can recover accounts without exposing whether an email is registered.
- Recovery and confirmation links use approved frontend URLs.

### AUTH-07: Strengthen authorization coverage

**Priority:** High  
**Status:** Completed on 2026-09-17

Required work:

- Add dedicated unit tests for `RolesGuard`.
- Test every role-restricted endpoint for allowed and denied roles.
- Test missing authenticated-user and missing-profile behavior.
- Establish a reusable decorator for accessing a required authenticated user, if
  useful.
- Review new controllers to ensure private routes cannot omit authentication.

Acceptance criteria:

- Role allow/deny behavior is explicitly tested.
- Adding a role decorator without authentication cannot silently expose a route.

Implementation notes:

- `RolesGuard` now distinguishes missing authentication (`401 Unauthorized`) from
  a missing or disallowed profile role (`403 Forbidden`).
- `@Roles()` now applies `SupabaseAuthGuard` and `RolesGuard` together, preventing
  role metadata from being added without enforcement.
- Unit tests cover no-role routes, permitted roles, all disallowed application
  roles, missing authentication, and missing profile-role context.
- HTTP tests cover administrator access, unauthenticated access, all non-admin
  roles, and malformed authenticated-user context on `GET /user-profiles`.

### AUTH-08: Validate configuration at startup

**Priority:** Medium  
**Status:** Not started

Required work:

- Validate `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, and
  `SUPABASE_PUBLISHABLE_KEY` using an explicit configuration schema.
- Separate variables required by the running app from migration-only variables.
- Fail startup with a clear message when required configuration is absent.
- Keep secrets out of logs and documentation.
- Add configuration tests.

Acceptance criteria:

- A misconfigured deployment fails during startup rather than on the first request.

### AUTH-09: Harden token parsing and login input

**Priority:** Medium  
**Status:** Not started

Required work:

- Parse the Bearer authentication scheme case-insensitively.
- Reject malformed or ambiguous authorization headers.
- Add reasonable maximum lengths to email and password inputs.
- Normalize email whitespace and casing before authentication where appropriate.
- Add boundary and malformed-input tests.

Acceptance criteria:

- Standards-compliant Bearer headers are accepted.
- Oversized or malformed authentication input is rejected before reaching
  Supabase.

### AUTH-10: Add real integration coverage

**Priority:** Medium  
**Status:** Not started

Current HTTP tests mock `AuthService`, so they verify NestJS routing but not the
real Supabase/profile integration.

Required work:

- Use an isolated Supabase test project or an approved local Supabase environment.
- Test login, token verification, profile lookup, account status, refresh, logout,
  and role authorization.
- Never use production accounts, keys, tokens, or databases.
- Make destructive test cleanup explicit and isolated.

Acceptance criteria:

- At least one automated test proves the real authentication components work
  together.

## Recommended Execution Order

1. AUTH-01 — Enforce account state during login
2. AUTH-07 — Strengthen authorization coverage
3. AUTH-02 — Add login rate limiting
4. AUTH-08 — Validate configuration at startup
5. AUTH-09 — Harden token parsing and login input
6. AUTH-03 — Add registration and profile provisioning
7. AUTH-04 — Add token refresh
8. AUTH-05 — Add logout and session revocation
9. AUTH-06 — Add password and email lifecycle flows
10. AUTH-10 — Add real integration coverage

## Decisions Needed

Record decisions here before implementing tasks that depend on them:

- Registration policy: undecided
- Initial public-user role: likely `CUSTOMER`, not yet approved
- Initial account status: undecided
- Browser token storage policy: undecided
- Mobile token storage policy: undecided
- Missing-profile login response: undecided
- Session revocation policy: undecided
- Production email provider and redirect URLs: undecided
- Login rate limit: five attempts per 60 seconds with a 60-second block
- Production proxy topology and distributed throttle storage: undecided
- Integration-test environment: undecided

## Progress Log

Add dated entries when a task begins or finishes.

- 2026-09-17: Initial authentication audit recorded. No implementation changes
  made as part of the audit.
- 2026-09-17: AUTH-01 completed. Build and lint pass; 15 standard tests and
  8 end-to-end tests pass.
- 2026-09-17: AUTH-07 completed. Build and lint pass; 22 standard tests and
  14 end-to-end tests pass.
- 2026-09-17: AUTH-02 completed. Build and lint pass; 25 standard tests and
  16 end-to-end tests pass.
