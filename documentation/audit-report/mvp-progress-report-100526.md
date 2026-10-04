## MVP Audit Report

### Current position

The booking backend has strong MVP building blocks, but the system is not yet ready for an honest end-to-end customer demo.

Merged work includes:

- Database migration baseline and booking schema.
- Safe demo Admin and Customer provisioning.
- Admin-managed deterministic pricing.
- Customer catalog, quote, booking submission, booking list, and booking detail APIs.
- Durable 10-minute quote expiry and idempotent booking submission.
- Advisory vehicle and Driver eligibility checks.
- Tour Package administration and active customer catalog.
- Non-production demo data setup and rehearsal runbook.
- Geoapify autocomplete, place resolution, and ordered route preview APIs.

### Issues that should be closed

None at this time.

The remaining partially implemented issues still have meaningful unfinished acceptance criteria:

| Issue | Why it remains open |
|---|---|
| #12 Geoapify | The provider boundary is merged, but route evidence is not yet bound to booking quote creation. Live non-production verification, observability, and provider integration coverage remain. |
| #14 Booking lifecycle | The MVP quote submission subset is complete, but full legal transition policy, Booking Review, route-backed quote evidence, and transition-matrix tests remain. |
| #22 Master data | Tour Packages are covered, but vehicle-type administration, audit history, and broader lifecycle behavior are incomplete. |
| #23 Fleet | Advisory readiness is covered, but historical readiness evidence, pagination, document/maintenance rules, and concurrency behavior are incomplete. |
| #34 Demo setup | The script and runbook are merged, but the actual non-production setup and recorded rehearsal should wait until the MVP is stable. |
| #20 Quality | Focused unit tests exist, but there is no authenticated database-backed end-to-end evidence yet. |
| #35 Frontend | Still in progress in the frontend repository. |

### Main MVP gaps

1. Route-to-quote binding  
   Geoapify can now calculate a route, but `POST /bookings/quote` still accepts raw stop coordinates and deterministic pricing still stores `0.00 km`. The route result must become server-owned quote evidence.

2. Frontend integration  
   The backend contracts exist, but no complete customer-facing journey has been proven:

   ```text
   Catalog → location search → route preview → quote → booking submit
   → AWAITING_PAYMENT → booking history/detail
   ```

3. End-to-end evidence  
   Unit tests cover important logic, but the team has not yet proven the authenticated flow against the non-production database.

4. Live Geoapify check  
   PR #44 establishes a safe disabled-by-default provider configuration. It still needs a non-production key and a controlled live validation after the codebase is stable.

5. Latest build confirmation  
   The first #44 build failed due to an unavailable NestJS exception class. That was fixed and pushed, but the post-fix build result has not yet been recorded.

### Recommended next sequence

1. Complete the focused #14 follow-up: bind Geoapify route output to quote issuance.
2. Let the frontend team integrate the stable backend journey under #35.
3. Add focused authenticated API evidence under #20:
   - customer ownership;
   - quote expiry;
   - quote single-use;
   - idempotency retry;
   - route/provider failure;
   - booking list and detail.
4. Once the MVP is stable, run `pnpm demo:setup-booking` only in approved non-production and record the rehearsal evidence under #34.

### Overall assessment

The backend is no longer a schema-only prototype. It has modular modules, controlled pricing, protected customer ownership, quote persistence, idempotency, and a route-provider boundary.

However, it should currently be described as:

> Backend MVP infrastructure ready, end-to-end booking MVP still in integration.

Do not present it as fully SRS-compliant yet. The most important truthfulness gap is that Geoapify route results are not yet used as authoritative booking quote evidence, and the visible frontend flow has not been demonstrated.