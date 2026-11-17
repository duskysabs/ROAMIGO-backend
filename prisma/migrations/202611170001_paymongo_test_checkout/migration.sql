CREATE TABLE "public"."paymongo_checkout" (
  "booking_id" UUID NOT NULL,
  "session_id" VARCHAR(255),
  "checkout_url" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "paymongo_checkout_pkey" PRIMARY KEY ("booking_id"),
  CONSTRAINT "paymongo_checkout_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("booking_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "paymongo_checkout_session_id_key" ON "public"."paymongo_checkout"("session_id");

CREATE TABLE "public"."paymongo_webhook_event" (
  "event_id" VARCHAR(255) NOT NULL,
  "session_id" VARCHAR(255) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "paymongo_webhook_event_pkey" PRIMARY KEY ("event_id")
);

ALTER TABLE "public"."paymongo_checkout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."paymongo_webhook_event" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."paymongo_checkout", "public"."paymongo_webhook_event" FROM anon, authenticated;
