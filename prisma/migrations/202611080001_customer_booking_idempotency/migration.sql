BEGIN;

CREATE UNIQUE INDEX "booking_customer_user_id_idempotency_key_key"
ON "public"."booking" ("customer_user_id", "idempotency_key");

DROP INDEX "public"."booking_idempotency_key_key";

COMMIT;
