# Live frontend integration verification

Date: November 19, 2026 (Asia/Manila).

## Environment and scope

- Frontend: local Next.js, port 3000, branch `codex/auth-integration`.
- Backend: local NestJS, port 3001, with the approved non-production Supabase database and Auth project.
- The latest redirect change was exercised through the frontend development server.
- Synthetic Customer and driver-linked STAFF identities were created for these checks. A synthetic vehicle was paired with the synthetic Driver; existing fleet records were not changed.
- No payments, dispatches, or trip execution were performed.

## Observed results

| Check | Result |
| --- | --- |
| Anonymous Staff, Accounting and My Bookings access | Redirected to login |
| Login without an application profile | Reached profile completion |
| Customer profile completion | Reached My Bookings |
| Completed Customer login | Reached My Bookings |
| Driver-linked STAFF access to Staff and Accounting | Both returned 404 |
| Driver login destination after redirect fix | Public home page |
| Tour-package catalog | Returned the active synthetic package |
| Tour-package quotation | PHP 3700.00 with server expiry |
| Submission without an eligible pair | Rejected with the availability/review message |
| Submission after preparing an eligible synthetic pair | Created one AWAITING_PAYMENT booking |
| Customer booking detail and list | Displayed the saved booking, schedule, route and amount |
| Two exact submission replays through the frontend API | Both returned HTTP 201 with the original booking; customer booking count remained one |

The saved synthetic booking is `f491beab-3e49-4099-9ed0-11a4446b47ee`.
Retry checks used the original quote and idempotency key. They did not simulate
a browser losing a response or reloading during an uncertain submission.

## Database reconciliation

The initial quotation failed because `public.resource_hold` was absent.
Migration history contained the squashed baseline and unique-driver-licence
migration. All five `202611080001` through `202611080005` migrations were pending.

Read-only preflight found no duplicate full payments, invalid booking intervals
or active assignment overlaps. A full custom-format database backup was saved
outside the repositories. Its archive inventory was readable and included
application data and migration history. Restoration was not rehearsed.

After authorization, `pnpm exec prisma migrate deploy --config prisma7.config.ts`
applied all five pending migrations successfully. Follow-up database inspection
confirmed every migration finished without rollback and the new resource-hold,
Driver-event and payment-audit tables existed. The catalog still returned HTTP 200.

## Verification limits

Earlier user-provided output showed nine authentication tests, lint and the
production build passing. The later Driver redirect change has a new regression
case, but tests, lint and production build were not rerun after that change.
The PostgreSQL concurrency suite and backup restoration were not run.
No commit, push or Render deployment was performed.

## Follow-up: Custom Trip and administrator coverage

The user subsequently supplied successful output for all ten authentication
regression cases, lint without warnings, and the production build including
TypeScript after the Driver redirect change.

Custom Trip was exercised in the browser against the local backend:

- Missing schedule/category inputs were rejected.
- Geoapify autocomplete returned public landmark suggestions. Keyboard
  selection worked, and unselected free text could not advance.
- Mactan-Cebu International Airport to Ayala Center Cebu produced a server
  route preview of 14.06 km and 24 minutes.
- The server quote was PHP 1200.00 with an expiry.
- A temporary localhost-only proxy dropped exactly one successful booking
  response after backend commit. The frontend displayed uncertain submission,
  disabled editing, and offered Retry submission.
- Retry recovered booking `be917672-c2fd-4984-b731-04cb2cbf8fef` at
  AWAITING_PAYMENT, and its detail view displayed the saved route and amount.
  Database inspection confirmed exactly one Custom Trip for this test customer.
- A separate synthetic quote was issued normally, then its expiry was set in
  the past for an explicit expired-fixture check. Submission through the
  frontend API returned HTTP 400 with no additional booking. Natural browser
  expiry after ten minutes was not tested.

The fault-injection proxy was stopped and the frontend's direct local backend
connection restored. No product source changes were needed for these checks.

Initial frontend source inspection found no dedicated Admin panel or `/admin` route.
ADMIN defaults to `/accounting` and can access `/staff`. Backend Admin APIs for
staff, fleet, tour packages and pricing exist, but dedicated administration
screens are not implemented. Existing Staff/Accounting preview screens must not
be treated as complete live administration.

## Follow-up: minimal Admin panel

A dedicated /admin frontend workspace was subsequently implemented. ADMIN now
defaults to that workspace, with live Staff, Vehicle, Driver, Package and Pricing
record lists and supported create/edit/lifecycle forms. The existing Booking and
Accounting workspaces retain their earlier integration boundaries.

A separate synthetic Administrator was created with explicit authorization.
Live browser creation of Staff, Driver, Vehicle, Package with ordered stops and
inactive Pricing records succeeded. All five Admin list endpoints returned HTTP
200. Overlapping pricing activation was rejected without changing existing
pricing. Customer page access returned 404; anonymous API access returned 401;
Customer/Driver API requests and foreign-origin mutations returned 403.
Same-origin unsupported commands, privilege-field injection and malformed IDs
returned 400. Desktop and narrow-screen layouts were visually inspected.

These results do not establish all edit/lifecycle commands, pagination with
multiple pages or uncertain Admin-save recovery. The new Admin regression
tests, lint and production build were not run. See the frontend's
docs/ADMIN_PANEL.md for supported operations and user-run verification commands.

## Follow-up: Accounting integration, November 20

The user subsequently supplied passing output for all 16 auth/staff/Admin tests,
lint and the production build. Those results predate the Accounting changes.

Frontend Payments now records and reviews manual receipts through the existing
backend payment endpoints. The new Assignment queue lists pending allocation
requests and supports confirmed retries. Server-side session checks, origin and
command validation, and recovery by replaying the same command are implemented.
Other Accounting screens remain explicitly labelled previews.

The local backend was unreachable when work resumed. The interrupted Admin
lifecycle batch could not be reconciled, and no fixture mutations were repeated.
The new Accounting tests, lint, build and runtime flows have not been run.
See frontend docs/ACCOUNTING_INTEGRATION.md for the contract and user-run checks.

## Accounting live browser verification, November 20

Started the backend on localhost:3001 and frontend on localhost:3000, connected
to the previously authorized non-production project. Used existing synthetic
Admin, Customer and Driver identities. No real funds were transferred.

- Anonymous Accounting access redirected to login.
- Admin recorded receipt BROWSER-20261120-REJECT-001 for the existing synthetic
  tour booking. It appeared as pending and was then rejected through the browser.
  The customer payment endpoint confirmed one FAILED receipt for PHP 3700.
- A PHP 1.00 receipt against the PHP 1200 Custom Trip quote was rejected with
  the exact-full-amount error. Correcting it to 1200.00 succeeded.
- Approval initially exceeded the frontend backend-request timeout. The browser
  locked the original command and offered Retry same action. Recovery succeeded
  without another receipt. The customer payment endpoint confirmed exactly one
  PAID receipt, a696c7bf-a3aa-4a32-bd37-560954125dda.
- Approval and a subsequent confirmed assignment retry returned PENDING with
  RETRY_REQUIRED. The queue retained booking be917672-c2fd-4984-b731-04cb2cbf8fef
  in PAID_AWAITING_ASSIGNMENT. Automatic allocation/dispatch did not pass.
  The backend logged its generic allocation-retry warning; the underlying
  database/transaction cause was not established.
- Customer Payments and Driver Assignments page access returned 404.
- Checked desktop and 390px layouts. The narrow viewport had scrollWidth 390
  and innerWidth 390. Mobile navigation opened and closed correctly.
- Corrected garbled progress punctuation and separators in AccountingOperations
  and verified the corrected text after reload.

No automated suite, lint or production build was run in this browser-testing
pass. The servers were left running for continued local inspection. Evidence:
accounting-browser-verified.png and accounting-mobile-verified.png in the local
visualizations artifact folder for this chat.

## Allocation deadline correction, November 20

Captured Prisma error P2028 during a retry of the synthetic Custom Trip. The
default transaction failed after approximately 6.8 seconds. Repeating that same
allocation with a bounded 15-second transaction deadline succeeded in 6.9
seconds. The original booking now has one PAID receipt and one DISPATCHED
driver/vehicle assignment.

AssignmentsService now sets a 15-second deadline only for allocation. Its
isolation level, eligibility checks, locks and exclusion constraints are
unchanged. Retry warnings include only the Prisma code or UNCLASSIFIED.
Regression coverage asserts the bounded deadline and safe P2028 handling.

A fresh browser-approved booking dispatched successfully, but the Accounting
proxy's ten-second default expired before its response arrived. The frontend
request helper now respects an explicit caller signal; Accounting writes use a
25-second deadline within the browser's existing 30-second deadline. Other
requests retain their configured default deadline.

After both corrections, browser approval of synthetic booking
1346ce33-870d-46aa-b027-74d9a4b56e4a returned successful assignment/dispatch on
the first submission. Database reads confirmed exactly one PAID receipt, one
ASSIGNED/DISPATCHED driver/vehicle assignment, a completed assignment request,
one allocation attempt and null lastFailure. No real funds were transferred.
Evidence: allocation-dispatch-verified.png in this chat's visualizations folder.

The development server automatically recompiled the backend change without
errors. Automated suites, lint and production builds were not run in this pass;
the new regression assertions still require user-run verification. The two
additional synthetic bookings and their receipts remain in the non-production
project as verification evidence.

## User-run checks and delivery tracking, November 20

The user subsequently ran the final allocation/payment suite: both files passed
with 24 tests total. Backend lint reported zero warnings and errors; the backend
build generated Prisma Client and completed without reported errors. Frontend
Accounting checks passed 7/7, lint was clean, and the production build including
TypeScript and all 43 pages succeeded. No additional suites were run during PR
preparation.

Scoped delivery is tracked by backend #68 and frontend #21. Existing backend
#17, #22 and #35 are related parent/dependency issues and retain their remaining
criteria. This rehearsal does not resolve #63: manual payments still lack the
server-owned face-to-face versus online booking-channel boundary. The frontend
integration is not a production payment-policy approval. No Render deployment
was performed.
