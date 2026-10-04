-- Durable quote binding and booking transition evidence. This migration only
-- adds public application objects and never modifies Supabase auth tables.

ALTER TABLE "booking" ADD COLUMN "idempotency_key" VARCHAR(100);
CREATE UNIQUE INDEX "booking_idempotency_key_key" ON "booking"("idempotency_key");

CREATE TABLE "booking_quote" (
  "booking_quote_id" UUID NOT NULL,
  "customer_user_id" UUID NOT NULL,
  "booking_type" "BookingType" NOT NULL,
  "vehicle_type_id" UUID NOT NULL,
  "tour_package_id" UUID,
  "request_snapshot" JSONB NOT NULL,
  "pricing_config_id" UUID NOT NULL,
  "total_distance_km" DECIMAL(12,2) NOT NULL,
  "estimated_duration_minutes" INTEGER NOT NULL,
  "final_quoted_price" DECIMAL(12,2) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "booking_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_quote_pkey" PRIMARY KEY ("booking_quote_id")
);

CREATE TABLE "booking_transition" (
  "booking_transition_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "previous_state" "BookingStatus" NOT NULL,
  "next_state" "BookingStatus" NOT NULL,
  "reason" TEXT,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_transition_pkey" PRIMARY KEY ("booking_transition_id")
);

CREATE UNIQUE INDEX "booking_quote_booking_id_key" ON "booking_quote"("booking_id");
CREATE INDEX "booking_quote_customer_user_id_expires_at_idx" ON "booking_quote"("customer_user_id", "expires_at");
CREATE INDEX "booking_transition_booking_id_occurred_at_idx" ON "booking_transition"("booking_id", "occurred_at");

ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("vehicle_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_tour_package_id_fkey" FOREIGN KEY ("tour_package_id") REFERENCES "tour_package"("tour_package_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_pricing_config_id_fkey" FOREIGN KEY ("pricing_config_id") REFERENCES "pricing_configuration"("pricing_config_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_quote" ADD CONSTRAINT "booking_quote_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_transition" ADD CONSTRAINT "booking_transition_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("booking_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_transition" ADD CONSTRAINT "booking_transition_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
