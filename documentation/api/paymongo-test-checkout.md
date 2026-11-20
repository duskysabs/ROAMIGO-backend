# PayMongo test checkout

This integration accepts **test payments only**. It requires a PayMongo `sk_test_` secret; a live secret is rejected. The browser never receives the secret key. PayMongo's hosted checkout does not need the public key. Live wallet activation and business verification are separate account steps.

## Setup

1. Apply the Prisma migration and set `PAYMONGO_TEST_SECRET_KEY` in the backend environment. Do not commit the key.
2. Set `PAYMONGO_TEST_SUCCESS_URL` and `PAYMONGO_TEST_CANCEL_URL` to frontend pages. These URLs only control where PayMongo sends the customer. A success redirect is **not** payment proof. `PAYMONGO_TEST_PAYMENT_METHODS` defaults to `card,gcash,paymaya`; set a subset if the test account only permits some methods.
3. Register a **test mode** PayMongo webhook at `https://<backend-host>/webhooks/paymongo/test` for `checkout_session.payment.paid`. Save that endpoint's separate signing secret as `PAYMONGO_TEST_WEBHOOK_SECRET`. The backend must be reachable over public HTTPS for PayMongo to deliver events.
4. Start checkout for a customer-owned booking awaiting payment with `POST /bookings/:bookingId/payments/paymongo/checkout` using the customer's normal bearer token. Send no request body. Open the returned `checkoutUrl` in the browser.
5. Read `GET /bookings/:bookingId/payments` to show the current status. Expect `PENDING` until a signed webhook is processed.

The checkout is limited to a customer-owned booking in `AWAITING_PAYMENT`, and the amount comes from its server-side quote in PHP. It creates one hosted session per booking. A repeated checkout request returns the existing URL while the booking awaits payment. Manual receipt recording and approval are refused after a PayMongo checkout has started, preventing the two paths from confirming the same booking.

The webhook verifies PayMongo's test signature over the exact request bytes and rejects stale signatures. It fetches the checkout session from PayMongo, checks test mode, one paid PHP payment, and the full quoted amount, then records the event and payment in one database transaction. A duplicate event does not create another transition or assignment. A paid booking creates a durable assignment request; allocation then follows the existing assignment workflow. A payment received after the booking changed state is recorded for staff review without assigning the booking.

The checkout request uses a booking-specific PayMongo idempotency key. PayMongo retains keys for 24 hours. If PayMongo definitively rejects a checkout request, the reservation is cleared so it can be retried after correcting the problem. If session creation times out or the process stops after contacting PayMongo, the booking stays reserved and returns a conflict on retry. Check the PayMongo test dashboard before clearing or retrying it manually so two payable sessions are not opened, especially after PayMongo's 24-hour idempotency window. This first test slice does not implement automatic checkout expiry, cancellation, refund, or recovery of ambiguous creation results.
