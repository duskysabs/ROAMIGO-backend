# Authentication Unit Tests

**Current-state review:** October 27, 2026

Authentication unit tests exercise application behavior with Supabase, Prisma,
and NestJS request context replaced by controlled mocks.

Relevant files:

```text
test/unit/auth.service.spec.ts
test/unit/auth.controller.spec.ts
test/unit/supabase-auth.guard.spec.ts
test/unit/login-rate-limit.guard.spec.ts
test/unit/roles.guard.spec.ts
test/unit/user-profiles.service.spec.ts
```

## Covered behavior

### Authentication service

- Signup returning email-confirmation or profile-completion state
- Successful password login
- Invalid-credential rejection
- Missing-profile login returning resumable onboarding state
- Inactive-account sign-out and rejection
- Valid and invalid access-token verification

### Controllers and guards

- Signup and login delegation
- Current-user response shape
- Missing, invalid, and non-Bearer authorization rejection
- Valid-token request context
- Role-free route access
- Required-role access
- Missing authentication and missing-profile-role rejection

### Rate limiting

- Configured attempt limit
- Independent tracking by client IP
- New attempt window after expiry

### Customer profile provisioning

- Active Customer profile and Customer record creation
- Rejection of duplicate profiles
- Input and persistence error handling
- Profile updates without caller-controlled role or account status

## Boundaries

These tests prove ROAMIGO logic, not Supabase or PostgreSQL behavior. Database
constraints, real authentication, transactions, and migration compatibility
require isolated integration tests.

On October 27, 2026, the complete unit suite passed 63 tests across 14 files in
the merged Booking Review source.
