# Authentication Unit Tests

## Overview

Authentication unit tests verify the behavior of `AuthService`,
`AuthController`, and `SupabaseAuthGuard` in isolation. Supabase and other
dependencies are mocked, so these tests do not make network requests or use real
credentials.

The authentication unit tests are stored in:

```text
test/unit/
├── auth.service.spec.ts
├── auth.controller.spec.ts
└── supabase-auth.guard.spec.ts
```

## AuthService Tests

File:

```text
test/unit/auth.service.spec.ts
```

The test module provides the real `AuthService` and replaces `SupabaseService`
with a mock client. The mock supplies fake `signInWithPassword()` and `getUser()`
functions.

### Successful login

The mocked Supabase client returns a fake session and user. The test verifies
that:

- The email and password are passed to Supabase correctly.
- The service returns the access token.
- The service returns the refresh token.
- The service returns the expiry and token type.
- The service returns the expected user ID and email.

### Failed login

The mocked Supabase client returns no session and an authentication error. The
test verifies that `AuthService` throws `UnauthorizedException`.

### Valid access token

The mocked `getUser()` function returns a fake user. The test verifies that:

- The correct access token is passed to Supabase.
- The expected user ID and email are returned.

### Invalid access token

The mocked `getUser()` function returns no user and an invalid-token error. The
test verifies that `AuthService` throws `UnauthorizedException`.

## SupabaseAuthGuard Tests

File:

```text
test/unit/supabase-auth.guard.spec.ts
```

These tests create fake NestJS execution contexts and replace
`AuthService.getUser()` with a mock.

### Missing Authorization header

The request contains no `Authorization` header. The test verifies that:

- The request is rejected with `UnauthorizedException`.
- `AuthService.getUser()` is not called.

### Incorrect authentication scheme

The request uses `Basic` instead of `Bearer`. The test verifies that:

- The request is rejected with `UnauthorizedException`.
- `AuthService.getUser()` is not called.

### Valid Bearer token

The request contains a valid fake Bearer token. The mocked authentication service
returns a user. The test verifies that:

- The guard returns `true`.
- The token is passed to `AuthService.getUser()`.
- The authenticated user is attached to `request.user`.

### Invalid Bearer token

The mocked authentication service rejects the fake token. The test verifies that
the guard returns an unauthorized error and passes the extracted token to the
authentication service.

## AuthController Tests

File:

```text
test/unit/auth.controller.spec.ts
```

The tests use the real `AuthController` with a mocked `AuthService`.

### Login delegation

The test calls the controller's login method with a fake `LoginDto`. It verifies
that the controller forwards the DTO to `AuthService.login()` and returns the
service result.

### Current authenticated user

The test creates a fake request containing a user that would normally be attached
by `SupabaseAuthGuard`. It verifies that the controller returns that user in the
expected response structure.

## Current Coverage

The authentication module currently has 10 unit tests:

```text
AuthService          4 tests
SupabaseAuthGuard    4 tests
AuthController       2 tests
```

These tests verify ROAMIGO's authentication behavior, not Supabase's internal
implementation.
