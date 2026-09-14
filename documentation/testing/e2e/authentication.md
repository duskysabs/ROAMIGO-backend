# Authentication End-to-End Tests

## Overview

Authentication end-to-end tests send HTTP requests through a NestJS testing
application. They verify that routing, validation, controllers, guards, status
codes, and response bodies work together.

The authentication end-to-end tests are stored in:

```text
test/e2e/auth.e2e-spec.ts
```

## Test Setup

The test creates a NestJS application using `AppModule`. It overrides
`AuthService` with mocked `login()` and `getUser()` functions.

The application also enables the same global `ValidationPipe` behavior used by
the running backend:

- Whitelist declared DTO fields
- Reject undeclared fields
- Transform request data when appropriate

Because `AuthService` is mocked, these tests do not contact the real Supabase
project and do not need real credentials.

## Login Endpoint Tests

Endpoint:

```http
POST /auth/login
```

### Successful login

The mocked authentication service returns fake tokens and user information. The
test verifies that the endpoint returns:

- HTTP `200 OK`
- An access token
- A refresh token
- Token expiry information
- The token type
- The authenticated user's ID and email

### Invalid email validation

The request contains an invalid email address. The test verifies that:

- The endpoint returns HTTP `400 Bad Request`.
- The response contains the email validation message.
- `AuthService.login()` is not called because validation fails first.

### Failed login

The mocked authentication service throws `UnauthorizedException`. The test
verifies that the endpoint returns HTTP `401 Unauthorized`.

## Protected Endpoint Tests

Endpoint:

```http
GET /auth/me
```

### Missing token

The request does not include an `Authorization` header. The test verifies that:

- The endpoint returns HTTP `401 Unauthorized`.
- `AuthService.getUser()` is not called.

### Valid token

The request includes a fake Bearer token, and the mocked authentication service
returns a fake user. The test verifies that:

- The endpoint returns HTTP `200 OK`.
- The response contains the expected user.
- The access token is passed to `AuthService.getUser()`.

## Current Coverage

The authentication end-to-end file currently contains five tests:

```text
POST /auth/login
├── successful login returns 200
├── invalid email returns 400
└── failed login returns 401

GET /auth/me
├── missing token returns 401
└── valid token returns 200
```

The starter `test/app.e2e-spec.ts` separately verifies the application's default
endpoint.

## Real Supabase Verification

These end-to-end tests intentionally mock `AuthService`. They verify the NestJS
HTTP behavior but do not prove that Supabase is reachable.

Real Supabase communication is currently checked manually with Postman. A future
integration test may use a separate Supabase test project. Production accounts,
keys, and databases must never be used for automated tests.
