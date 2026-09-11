# Authentication

## Overview

ROAMIGO uses Supabase Authentication to manage user accounts, passwords, sessions, and authentication tokens.

NestJS provides the authentication endpoints, validates incoming requests, and protects private routes. Prisma will manage application profiles and roles, but it does not check passwords or issue authentication tokens.

```text
Supabase Auth → accounts, passwords, sessions, and tokens
NestJS       → endpoints, validation, guards, and authorization
Prisma       → profiles, roles, and application data
```

## Current Features

The following authentication features are currently implemented:

- Password-based login
- Login request validation
- Supabase access-token creation
- Bearer-token verification
- Protected endpoints
- Rejection of missing or invalid tokens

Current endpoints:

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| `POST` | `/auth/login` | Sign in with email and password | Public |
| `GET` | `/auth/me` | Return the authenticated user | Bearer token required |

## Project Structure

```text
src/
├── auth/
│   ├── dto/
│   │   └── login.dto.ts
│   ├── guards/
│   │   └── supabase-auth.guard.ts
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   └── auth.service.ts
├── supabase/
│   ├── supabase.module.ts
│   └── supabase.service.ts
├── app.module.ts
└── main.ts
```

## Component Responsibilities

### Global Validation Pipe

The global `ValidationPipe` is configured in `src/main.ts`.

It validates incoming request data before the request reaches a controller.

The current configuration:

- Applies DTO validation rules
- Rejects properties not declared in the DTO
- Transforms request values when appropriate
- Applies to every controller in the application

### Login DTO

The file `src/auth/dto/login.dto.ts` defines the required login data.

The login request must contain:

- A valid email address
- A password represented as a non-empty string

Invalid data produces a `400 Bad Request` response before Supabase is contacted.

### Auth Controller

The file `src/auth/auth.controller.ts` defines the authentication HTTP endpoints.

Its current routes are:

```text
POST /auth/login
GET  /auth/me
```

The controller receives the HTTP request and passes the main work to `AuthService`.

### Auth Service

The file `src/auth/auth.service.ts` contains the authentication logic.

Its current responsibilities are:

- Sending login credentials to Supabase Authentication
- Returning session tokens after a successful login
- Asking Supabase to validate an access token
- Returning the user associated with a valid token

### Supabase Auth Guard

The file `src/auth/guards/supabase-auth.guard.ts` protects private endpoints.

The guard:

1. Reads the `Authorization` request header.
2. Requires the `Bearer` authentication format.
3. Extracts the access token.
4. Passes the token to `AuthService`.
5. Rejects invalid or expired tokens.
6. Adds the verified user to the request.

### Auth Module

The file `src/auth/auth.module.ts` groups the authentication components.

It:

- Imports `SupabaseModule`
- Registers `AuthController`
- Provides `AuthService`
- Provides `SupabaseAuthGuard`

A NestJS module connects related components. It does not define a route by itself.

### Supabase Service

The file `src/supabase/supabase.service.ts` creates the Supabase client used by the backend.

It reads these environment variables:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

The service configures Supabase for server-side use without browser session persistence.

## Login Flow

The login endpoint is:

```http
POST /auth/login
```

Example request body:

```json
{
  "email": "user@example.com",
  "password": "user-password"
}
```

The login request follows this sequence:

```text
Postman or frontend
        ↓
POST /auth/login
        ↓
Global ValidationPipe
        ↓
LoginDto
        ↓
AuthController
        ↓
AuthService
        ↓
SupabaseService
        ↓
Supabase Authentication
```

The process works as follows:

1. The client sends an email and password.
2. The global `ValidationPipe` applies the rules in `LoginDto`.
3. `AuthController` receives the validated request.
4. The controller calls `AuthService.login()`.
5. `AuthService` creates a Supabase client through `SupabaseService`.
6. Supabase Authentication verifies the credentials.
7. NestJS returns the session tokens and basic user information.

Example successful response:

```json
{
  "accessToken": "access-token",
  "refreshToken": "refresh-token",
  "expiresIn": 3600,
  "tokenType": "bearer",
  "user": {
    "id": "supabase-user-uuid",
    "email": "user@example.com"
  }
}
```

Access and refresh tokens are sensitive. They must not be committed, logged, or shared.

## Protected Route Flow

The protected test endpoint is:

```http
GET /auth/me
```

The request must include this header:

```http
Authorization: Bearer ACCESS_TOKEN
```

The protected request follows this sequence:

```text
Postman or frontend
        ↓
GET /auth/me
        ↓
SupabaseAuthGuard
        ↓
AuthService.getUser()
        ↓
Supabase validates the token
        ↓
Verified user attached to request
        ↓
AuthController returns the user
```

The process works as follows:

1. The client sends a request with an access token.
2. `SupabaseAuthGuard` reads the `Authorization` header.
3. The guard extracts the Bearer token.
4. The guard calls `AuthService.getUser()`.
5. Supabase Authentication validates the token.
6. The verified user is added to the request.
7. The controller returns the authenticated user.

Example successful response:

```json
{
  "user": {
    "id": "supabase-user-uuid",
    "email": "user@example.com"
  }
}
```

## Error Responses

### Invalid Email Format

An incorrectly formatted email produces:

```json
{
  "message": [
    "email must be an email"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

This confirms that `LoginDto` and the global `ValidationPipe` are working.

### Incorrect Credentials

An incorrect email or password produces:

```json
{
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "statusCode": 401
}
```

### Missing Bearer Token

Calling a protected route without a token produces:

```json
{
  "message": "Bearer token is required",
  "error": "Unauthorized",
  "statusCode": 401
}
```

### Invalid or Expired Token

An invalid or expired token produces a `401 Unauthorized` response.

## Environment Variables

Authentication currently uses:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

These are different from the Prisma database connection variables:

```env
DATABASE_URL=
DIRECT_URL=
```

- `SUPABASE_URL` identifies the Supabase project API.
- `SUPABASE_PUBLISHABLE_KEY` allows the application to call Supabase APIs under configured security policies.
- `DATABASE_URL` is Prisma’s pooled PostgreSQL connection.
- `DIRECT_URL` is Prisma’s migration and administrative PostgreSQL connection.

Database connection strings must never be exposed to the frontend.

## Email Confirmation

Email confirmation is currently disabled during development. This allows test accounts to sign in without relying on Supabase’s limited built-in development email service.

Before production:

- Enable email confirmation
- Configure a custom SMTP provider
- Configure the correct frontend redirect URLs
- Test email confirmation
- Test password recovery

## User Profiles and Prisma

Supabase Authentication stores the authentication identity. Prisma will store the corresponding application profile and role.

```text
Supabase authentication user
└── id: UUID
      ↓ same UUID
Prisma profile
├── id: UUID
├── role
├── first name
├── last name
└── other application information
```

The same UUID will connect the authentication account to the application profile.

Passwords must never be copied into Prisma models or public application tables.

## Security Rules

- Never commit `.env`
- Never document real passwords or tokens
- Never expose database connection strings to the frontend
- Never store plain-text passwords
- Never use a Supabase secret key in browser code
- Validate all incoming request data
- Protect private endpoints with authentication guards
- Add role checks to role-restricted operations

## Current Testing Status

The following cases have been tested successfully:

- Login request validation
- Successful password login
- Access-token creation
- Protected `/auth/me` request
- Bearer-token verification
- Missing-token rejection

## Planned Authentication Work

The next authentication features may include:

- Customer registration
- Prisma profile creation
- Role-based authorization
- Token refresh
- Logout
- Password recovery
- Production email confirmation
- Automated authentication tests