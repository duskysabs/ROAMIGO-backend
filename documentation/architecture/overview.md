# System Architecture

## Overview

ROAMIGO uses separate services for its user interface, business logic, authentication, database, and intelligent pricing features.

```text
Next.js PWA
     │
     │ HTTPS requests
     ▼
NestJS Backend
     ├── Supabase Authentication
     ├── Prisma ORM ── Supabase PostgreSQL
     ├── Supabase Storage
     ├── PayMongo
     ├── Geoapify
     └── FastAPI Pricing Service
```

The NestJS backend acts as the main entry point for application operations. The frontend should not connect directly to the PostgreSQL database.

## Components

### Next.js Frontend

The Next.js Progressive Web Application provides interfaces for:

- Customers
- Administrators
- Staff
- Drivers

It sends API requests to NestJS and displays the returned information.

### NestJS Backend

NestJS contains the main application logic, including:

- Authentication integration
- Request validation
- Authorization and role enforcement
- Booking management
- Driver and vehicle management
- Payment coordination
- Notifications
- Reports
- External service integrations

### Supabase Authentication

Supabase Authentication manages:

- User identities
- Passwords
- Login sessions
- Access tokens
- Refresh tokens
- Email confirmation
- Password recovery

NestJS verifies Supabase access tokens before allowing access to protected endpoints.

### Prisma ORM

Prisma provides type-safe access between NestJS and PostgreSQL.

It is responsible for:

- Defining application data models
- Querying application records
- Creating and applying database migrations
- Generating a typed Prisma Client

Prisma does not manage user passwords or issue authentication tokens.

### Supabase PostgreSQL

PostgreSQL stores the operational application data, including:

- User profiles and roles
- Customers and drivers
- Vehicles
- Tour packages
- Bookings and route stops
- Payments
- Payment records
- Assignments
- Maintenance records
- Compliance records
- Notifications
- Reports

### Supabase Storage

Supabase Storage stores authorized uploaded files, such as:

- Vehicle images
- Payment evidence
- Compliance documents
- Other application attachments

The PostgreSQL database should store file information and storage paths rather than the file contents.

### FastAPI Pricing Service

The Python FastAPI service will provide demand-based price suggestions using a Random Forest Regressor.

NestJS remains responsible for applying pricing rules, limits, and fallback behavior before accepting a calculated price.

### External Services

ROAMIGO will integrate with:

- PayMongo for electronic payments
- Geoapify for locations, routing, distance, and travel-time estimates
- Google Maps deep links for driver navigation

External credentials must be stored in environment variables and used only by the appropriate backend service.

## Authentication Request Flow

```text
User credentials
      ↓
Next.js or Postman
      ↓
NestJS authentication endpoint
      ↓
Supabase Authentication
      ↓
Access and refresh tokens
```

For protected requests:

```text
Bearer Nen token
      ↓
NestJS authentication guard
      ↓
Supabase validates the token
      ↓
NestJS processes the authorized request
```

## Database Request Flow

```text
Next.js
   ↓
NestJS controller
   ↓
NestJS service
   ↓
Prisma Client
   ↓
Supabase PostgreSQL
```

The frontend must not receive database passwords or direct PostgreSQL connection strings.

## User Identity and Profile Relationship

Supabase Authentication stores the authentication identity. PostgreSQL stores the application profile.

```text
Supabase Authentication user
└── id: UUID
      ↓ same UUID
PostgreSQL profile
├── id: UUID
├── role
├── name
└── application information
```

This allows Supabase to remain responsible for authentication while NestJS and Prisma manage application-specific user information.

## Deployment Overview

The intended deployment structure is:

```text
Vercel
└── Next.js PWA

Render
├── NestJS backend
└── FastAPI pricing service

Supabase
├── Authentication
├── PostgreSQL
└── Storage
```

Each deployed service receives its required environment variables through its deployment platform. Real `.env` files must not be committed or copied into public images.

## Current Implementation Status

Currently implemented:

- Supabase password login
- Login request validation
- Access-token verification
- Protected current-user endpoint
- Prisma and Supabase database connection configuration
- Prisma Client generation
