# ROAMIGO Backend Documentation

This directory contains the technical documentation for the ROAMIGO backend.

## Documentation

### Current state

- [Implementation tracker, November 8](./audit-report/implementation-tracker-2026-11-08.md): source coverage, open-issue reconciliation and verification limits.

- [MVP progress report](./audit-report/mvp-progress-report-100526.md) — Current implemented boundary, verification evidence, and payment-independent next work.
- [Booking module pending work](./booking-module-pending-work.md) — Production gaps and explicit lifecycle boundaries.

### Authentication

- [Authentication overview](./authentication/overview.md) — Login flow, protected endpoints, Supabase Authentication, validation, and Postman testing.
- [Authentication work plan](./authentication/auth-work-plan.md) — Completed authentication behavior, open hardening work, and current decisions.

### System Architecture

- [System architecture](./architecture/overview.md) — Major components and how they communicate.
- [Capstone ERD alignment review](./architecture/capstone-erd-alignment-review.md) — Implemented deviations, migration guardrails, and schema decisions.

### Booking API

- [Manual payments and initial assignment](./api/manual-payments-and-assignment.md): full-payment verification, operator access and durable allocation requests.
- [Manual payment database verification](./testing/manual-payments-postgres.md): migration preflight and isolated database checks.

- [Booking MVP contract](./api/booking-mvp-contract.md) — Customer catalog, quote preview, booking, and state semantics.
- [Fleet management contract](./api/fleet-management-contract.md) — Vehicle and Driver master data, pairing, readiness, and availability.
- [Staff Administration contract](./api/staff-administration-contract.md) — Administrator-managed Staff onboarding, profile maintenance, and employment lifecycle.

### Testing

- [Testing overview](./testing/overview.md) — Testing levels, structure, commands, and security practices.
- [Authentication unit tests](./testing/unit/authentication.md) — Service, controller, and guard unit tests.
- [Authentication end-to-end tests](./testing/e2e/authentication.md) — HTTP login and protected-route tests.
- [Booking MVP test cases](./testing/booking-mvp-test-cases.md) — Living automated, manual, and blocked verification checklist.
- [Booking Review Postman collection](./postman/README.md) — Importable collection and safe local environment template for the outsourced-resource review workflow.

### Supabase PostgreSQL and Prisma

- [Booking domain migration runbook](./database/booking-domain-migration-runbook.md) — Squashed-baseline reconciliation, rollout, verification, and recovery boundaries.

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
