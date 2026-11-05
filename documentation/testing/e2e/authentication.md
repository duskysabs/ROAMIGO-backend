# Authentication HTTP-Level Tests

**Current-state review:** October 27, 2026

## Scope

The authentication HTTP-level tests start a NestJS testing application and send
requests through routing, validation, controllers, guards, and error mapping.
Application services are overridden with mocks, so these tests do not contact
Supabase or a real database.

Relevant files:

```text
test/e2e/auth.e2e-spec.ts
test/e2e/auth-throttling.e2e-spec.ts
test/e2e/user-profiles.e2e-spec.ts
```

## Covered behavior

### Signup and login

- Successful login response
- Invalid email rejection
- Authentication failure
- Inactive-account rejection
- Missing-profile login returning the profile-completion step
- Signup followed by resumable onboarding

### Current user and profile completion

- Missing-token rejection
- Authenticated current-user response
- Customer profile completion for a token-authenticated user without a profile
- Invalid-token rejection
- Phone-number validation
- Rejection of caller-controlled privileged roles
- Administrator-only profile listing and denial of other roles
- Rejection of malformed authenticated context without a profile role

### Rate limiting

- Five configured login attempts followed by `429 Too Many Requests`
- Unrelated routes remaining outside the strict login limit

## Test setup requirements

The application module constructs Prisma and Supabase providers even when the
tested service is mocked. The test environment therefore needs syntactically
valid placeholder configuration, but the suite must not point at or mutate a
real database.

The tests open temporary localhost ports through Supertest. Restricted execution
environments must allow local loopback connections.

## Current evidence

On October 27, 2026, the complete HTTP-level suite passed 21 tests across four
files, including the starter application endpoint test.

This proves NestJS HTTP behavior with mocked application boundaries. It does not
prove Supabase connectivity, Prisma persistence, migration correctness, or
transactional behavior. Those require a separate isolated integration suite.
