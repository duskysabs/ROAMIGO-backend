# Testing Overview

## Purpose

Automated tests verify that the backend continues to behave as expected when its
code changes. They reduce repeated manual checking and help detect regressions
before changes are merged or deployed.

ROAMIGO separates tests by testing level:

```text
test/
├── unit/
├── integration/
└── e2e/
```

Tests are organized by application module inside each level as the project grows.

```text
test/
├── unit/
│   ├── auth.service.spec.ts
│   ├── auth.controller.spec.ts
│   └── supabase-auth.guard.spec.ts
└── e2e/
    └── auth.e2e-spec.ts
```

## Unit Tests

Unit tests check one class or function in isolation. External dependencies are
replaced with mocks so the result is fast and predictable.

For example, an authentication service unit test replaces the real Supabase
client with a mock. The test checks ROAMIGO's authentication logic without using
the internet, real credentials, or a real Supabase user.

Unit tests should answer questions such as:

- Does the service return the expected data?
- Does it call its dependency with the correct arguments?
- Does it throw the correct exception when an operation fails?
- Does a guard accept and reject requests correctly?
- Does a controller forward data to the correct service?

Module-specific unit-test documentation:

- [Authentication unit tests](./unit/authentication.md)

## Integration Tests

Integration tests check whether multiple real components work together. Examples
include testing Prisma against a dedicated test database or testing the backend
against a separate Supabase test project.

Integration tests are slower than unit tests and may require test environment
variables. They must never use the production database or production accounts.

No module-specific integration tests have been added yet.

## End-to-End Tests

End-to-end tests start a NestJS application and send HTTP requests to its routes.
They verify routing, validation, controllers, guards, services, HTTP status codes,
and response bodies working together.

ROAMIGO's authentication end-to-end tests use a mocked `AuthService`. This keeps
the HTTP behavior realistic while avoiding calls to the real Supabase project.
Manual Postman testing is still used when the real Supabase connection needs to
be verified.

Module-specific end-to-end documentation:

- [Authentication end-to-end tests](./e2e/authentication.md)

## Arrange, Act, Assert

Tests generally follow three stages:

1. **Arrange** prepares input, mocks, and expected results.
2. **Act** calls the code being tested.
3. **Assert** checks the result and interactions.

```text
Arrange test conditions
        ↓
Act by calling the code
        ↓
Assert the expected behavior
```

## Test Data and Secrets

Automated tests should use clearly fake values such as:

```text
test@example.com
fake-user-id
fake-access-token
```

Tests must not contain:

- Real passwords
- Real access or refresh tokens
- Database connection strings
- Supabase secret keys
- Production customer information

## Running Tests

Run unit tests with:

```bash
pnpm test
```

Run end-to-end tests with:

```bash
pnpm run test:e2e
```

Run the application build as a separate verification step:

```bash
pnpm run build
```

All relevant checks should pass before a pull request is merged.

## Adding Tests for a New Module

When a new module is created:

1. Add unit tests for its services, controllers, and guards.
2. Add end-to-end tests for important HTTP behavior and user workflows.
3. Add integration tests only when real component interaction needs verification.
4. Add or update the module-specific documentation under this directory.

Tests should focus on business behavior rather than creating one test file for
every database table.
