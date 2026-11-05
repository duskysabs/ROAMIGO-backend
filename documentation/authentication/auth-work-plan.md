# Authentication Work Plan

## Purpose

This file is the source of truth for the ROAMIGO authentication and authorization
work. Update the status and notes here as each task is completed.

## Current Implementation

The backend currently provides:

- Public Customer signup through Supabase Auth: `POST /auth/signup`
- Password login through Supabase Auth: `POST /auth/login`
- Access-token verification through Supabase Auth
- Current-user endpoint: `GET /auth/me`
- Resumable Customer profile completion: `POST /user-profiles/me/complete`
- Authenticated profile updates: `PATCH /user-profiles/me`
- Prisma-backed user profiles
- Application roles: `ADMIN`, `CUSTOMER`, `STAFF`, and `DRIVER`
- Application account states: `ACTIVE` and `INACTIVE`
- Authentication and role guards
- DTO validation with a global `ValidationPipe`
- Row-level security and revoked direct client access to `user_profile`

Current verification on 2026-10-27:

- Build passes
- Lint passes
- 63 unit tests pass
- 21 HTTP-level tests pass with mocked application boundaries and placeholder
  test configuration
- Real Supabase and database integration coverage remains pending

## Work Queue

### AUTH-01: Enforce account state during login

**Priority:** Critical  
**Status:** Completed on 2026-09-17

Login checks the application profile after Supabase authenticates the user.
Missing-profile users receive a resumable onboarding response, while inactive
profiles are signed out and denied tokens.

Required work:

- Load the user's profile after Supabase validates the credentials.
- Return a constrained onboarding response when the profile is missing.
- Do not return tokens when `accountStatus` is not `ACTIVE`.
- Decide whether missing profiles should return `403 Forbidden` or a generic login
  failure response.
- Define how disabling an application account affects existing Supabase sessions.
- Add unit and HTTP-level tests for missing and inactive profiles.

Acceptance criteria:

- An active user with a profile can log in and continue to the application.
- A missing-profile user is directed to complete the Customer profile.
- An inactive user receives no tokens.
- Protected endpoints continue rejecting inactive users even if they possess an
  older token.

Implementation notes:

- Login now loads the Prisma profile before returning authentication tokens.
- Missing-profile login returns the Supabase session with
  `nextStep: COMPLETE_PROFILE`; protected application routes still require a
  completed active profile.
- Inactive-account login signs out the newly created Supabase session and
  returns `403 Forbidden` without exposing its tokens.
- Existing protected-route checks remain in place for previously issued tokens.
- Unit and HTTP coverage verify active, missing-profile, and inactive-account
  login paths.

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
**Status:** Completed for resumable Customer onboarding on 2026-10-07

Public signup creates the Supabase identity first. A user with a confirmed
session then completes an application profile through an authenticated endpoint.
This is intentionally resumable rather than a distributed transaction across
Supabase Auth and Postgres.

Required work:

- Provide public Customer registration without accepting privileged role or
  account-status input.
- Return explicit next-step state for email confirmation or profile completion.
- Allow an authenticated user without a profile to resume onboarding.
- Never allow public callers to choose privileged roles or active status.
- Reject duplicate profile completion without replacing the existing profile.
- Add validation and tests.

Acceptance criteria:

- A registered user without a profile is explicitly marked as requiring profile
  completion and cannot use profile-protected application routes.
- Completing a profile creates exactly one active `CUSTOMER` profile and linked
  Customer record.
- Public registration cannot create `ADMIN`, `STAFF`, or `DRIVER` privileges.

Implementation notes:

- `POST /auth/signup` normalizes the email, validates bounded credentials, and
  reports `CONFIRM_EMAIL` or `COMPLETE_PROFILE` as the next step.
- `POST /auth/login` resumes incomplete onboarding with
  `nextStep: COMPLETE_PROFILE`.
- `POST /user-profiles/me/complete` uses token-only authentication so a user
  without a profile can create one.
- Profile completion always creates an active Customer and rejects duplicates.
- Privileged demo profiles remain restricted to the guarded non-production
  bootstrap workflow.

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
**Status:** Partially complete

Required work:

- Parse the Bearer authentication scheme case-insensitively.
- Reject malformed or ambiguous authorization headers.
- Add reasonable maximum lengths to email and password inputs.
- Normalize email whitespace and casing before authentication where appropriate.
- Add boundary and malformed-input tests.

Current partial coverage:

- Signup trims and lowercases email addresses and enforces email/password length
  limits.
- Login input still lacks equivalent normalization and maximum lengths.
- Both authentication guards still require the exact case-sensitive `Bearer `
  prefix and need shared malformed-header handling.

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

1. AUTH-08 — Validate configuration at startup
2. AUTH-09 — Finish token parsing and login input hardening
3. AUTH-04 — Add token refresh
4. AUTH-05 — Add logout and session revocation
5. AUTH-06 — Add password and email lifecycle flows
6. AUTH-10 — Add real integration coverage

## Decisions Needed

Record decisions here before implementing tasks that depend on them:

- Registration policy: public Customer signup with resumable onboarding
- Initial public-user role: `CUSTOMER`
- Initial account status: `ACTIVE` when Customer profile completion succeeds
- Browser token storage policy: undecided
- Mobile token storage policy: undecided
- Missing-profile login response: return the authenticated session with
  `requiresProfile: true` and `nextStep: COMPLETE_PROFILE`
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
- 2026-10-07: AUTH-03 completed for public Customer signup and resumable profile
  completion. Privileged profile creation remains restricted.
- 2026-10-27: Documentation reconciled with the current implementation. Build,
  lint, 63 unit tests, and 21 mocked HTTP-level tests pass; real integration
  coverage remains pending.
