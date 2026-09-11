# ROAMIGO Backend Documentation

This directory contains the technical documentation for the ROAMIGO backend.

## Documentation

### Authentication
- [Authentication overview](./authentication/overview.md) — Login flow, protected endpoints, Supabase Authentication, validation, and Postman testing.

### System Architecture
- [System architecture](./architecture/overview.md) — Major components and how they communicate.

### Supabase PostgreSQL and Prisma
### Database migrations
### API testing 
### Docker and deployment
### Role-based authorization
### Background jobs and integrations

## Technology Overview

The backend uses:

- NestJS with TypeScript for the API and business logic
- Supabase Authentication for user identity and sessions
- PostgreSQL through Supabase for application data
- Prisma ORM for type-safe database access
- Postman for manual API testing

## Security

Real passwords, database connection strings, API secrets, access tokens, and refresh tokens must never be included in these documents or committed to Git.

## Links
