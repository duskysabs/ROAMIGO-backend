# Booking Module: Pending Work

This branch establishes the booking-foundation schema and customer booking API.
It deliberately stops before any action that could confirm a payment, reserve a
vehicle, or assign a driver.

## Required before production use

| Priority | Work item | Reason it remains pending |
| --- | --- | --- |
| Blocker | Generate, review, and apply the Prisma migration against Supabase Postgres. | The current hosted database contains only `user_profile`; credentials are still required to create and verify the booking tables safely. |
| Blocker | Implement the external ML pricing-service HTTP client and persist pricing-calculation audit data. | The current pricing gateway intentionally fails closed until the other repository publishes its contract. |
| Blocker | Implement PayMongo payment intent creation and signed webhook verification. | A quote is not payment confirmation; the booking remains `AWAITING_PAYMENT` until a verified payment event. |
| Blocker | Add a restricted staff workflow for verified manual payments, if manual payments are supported. | Staff verification needs authorization, proof handling, and an audit trail. |
| Blocker | Implement post-payment transactional assignment. | It must re-check availability and atomically create the vehicle-driver assignment so concurrent confirmations cannot double-book a pair. |
| High | Add PostgreSQL-level overlap protection for vehicle and driver schedules. | Application checks are advisory before payment and cannot alone guarantee concurrency safety. |
| High | Add integration/e2e tests using an isolated Supabase/Postgres database. | Current focused tests use mocks because no database credentials are available. |
| Medium | Add customer cancellation, refund, receivables, notifications, travel-slip, and outsourcing workflows. | These ERD entities are modeled but do not yet expose business APIs. |
| Medium | Create the full booking-module manual/API test matrix in `documentation/`. | This is deferred until the pending payment and assignment workflows define their final behavior. |

## Current lifecycle boundary

`POST /bookings` validates the customer request, verifies there is a currently
eligible vehicle-driver pair, receives a backend-controlled price quote, and
stores the booking as `AWAITING_PAYMENT`. It creates no payment, reservation,
or assignment.
