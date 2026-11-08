BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "public"."payment_audit" (
  "payment_audit_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "action" VARCHAR(20) NOT NULL,
  "actor_role" "public"."UserRole" NOT NULL,
  "previous_state" "public"."PaymentStatus",
  "next_state" "public"."PaymentStatus" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_audit_pkey" PRIMARY KEY ("payment_audit_id"),
  CONSTRAINT "payment_audit_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_audit_action_check" CHECK ("action" IN ('RECORDED', 'DECIDED'))
);
CREATE UNIQUE INDEX "payment_audit_payment_id_action_key" ON "public"."payment_audit"("payment_id", "action");

CREATE TABLE "public"."assignment_request" (
  "booking_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_failure" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assignment_request_pkey" PRIMARY KEY ("booking_id"),
  CONSTRAINT "assignment_request_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("booking_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assignment_request_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profile"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assignment_request_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "assignment_request_completed_at_created_at_idx" ON "public"."assignment_request"("completed_at", "created_at");

ALTER TABLE "public"."booking_assignment" ADD COLUMN "reserved_from" TIMESTAMPTZ(3), ADD COLUMN "reserved_until" TIMESTAMPTZ(3);
UPDATE "public"."booking_assignment" a SET "reserved_from" = b."start_datetime", "reserved_until" = b."end_datetime"
FROM "public"."booking" b WHERE a."booking_id" = b."booking_id";
ALTER TABLE "public"."booking_assignment" ALTER COLUMN "reserved_from" SET NOT NULL, ALTER COLUMN "reserved_until" SET NOT NULL;
ALTER TABLE "public"."booking_assignment" ADD CONSTRAINT "assignment_interval_check" CHECK ("reserved_from" < "reserved_until");

-- Half-open intervals allow adjacent trips; each resource is protected independently.
ALTER TABLE "public"."booking_assignment" ADD CONSTRAINT "assignment_vehicle_no_overlap"
EXCLUDE USING gist ("vehicle_id" WITH =, tstzrange("reserved_from", "reserved_until", '[)') WITH &&)
WHERE ("assignment_status" IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED'));
ALTER TABLE "public"."booking_assignment" ADD CONSTRAINT "assignment_driver_no_overlap"
EXCLUDE USING gist ("driver_id" WITH =, tstzrange("reserved_from", "reserved_until", '[)') WITH &&)
WHERE ("assignment_status" IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED'));

-- This first slice accepts one full payment; deposits need a separate ledger policy.
CREATE UNIQUE INDEX "payment_one_full_receipt_per_booking"
ON "public"."payment"("booking_id") WHERE "payment_status" IN ('PAID', 'CONFIRMED');

CREATE FUNCTION "public"."immutable_payment_audit"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Payment audit records are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "payment_audit_immutable" BEFORE UPDATE OR DELETE ON "public"."payment_audit"
FOR EACH ROW EXECUTE FUNCTION "public"."immutable_payment_audit"();

CREATE FUNCTION "public"."guard_assigned_resources"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'vehicle' THEN
    IF (NEW.vehicle_status, NEW.assigned_driver_id, NEW.is_deleted, NEW.passenger_capacity, NEW.vehicle_type_id)
       IS DISTINCT FROM (OLD.vehicle_status, OLD.assigned_driver_id, OLD.is_deleted, OLD.passenger_capacity, OLD.vehicle_type_id)
       AND EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.vehicle_id = OLD.vehicle_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before vehicle changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'driver' THEN
    IF (NEW.driver_status, NEW.license_expiry, NEW.staff_id) IS DISTINCT FROM (OLD.driver_status, OLD.license_expiry, OLD.staff_id)
       AND EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.driver_id = OLD.driver_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before driver changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'staff' THEN
    IF NEW.employment_status IS DISTINCT FROM OLD.employment_status
       AND EXISTS (SELECT 1 FROM public.driver d JOIN public.booking_assignment a ON a.driver_id = d.driver_id
         WHERE d.staff_id = OLD.staff_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before employment changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'user_profile' THEN
    IF (NEW.account_status, NEW.role) IS DISTINCT FROM (OLD.account_status, OLD.role)
       AND EXISTS (SELECT 1 FROM public.staff s JOIN public.driver d ON d.staff_id = s.staff_id
         JOIN public.booking_assignment a ON a.driver_id = d.driver_id WHERE s.user_id = OLD.user_id
         AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before account changes' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "vehicle_assignment_guard" BEFORE UPDATE ON public.vehicle FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_resources();
CREATE TRIGGER "driver_assignment_guard" BEFORE UPDATE ON public.driver FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_resources();
CREATE TRIGGER "staff_assignment_guard" BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_resources();
CREATE TRIGGER "account_assignment_guard" BEFORE UPDATE ON public.user_profile FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_resources();

CREATE FUNCTION "public"."validate_assignment_interval"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  trip public.booking%ROWTYPE;
BEGIN
  SELECT * INTO trip FROM public.booking WHERE booking_id = NEW.booking_id FOR UPDATE;
  IF NEW.reserved_from IS DISTINCT FROM trip.start_datetime OR NEW.reserved_until IS DISTINCT FROM trip.end_datetime THEN
    RAISE EXCEPTION 'Assignment interval must match its booking' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "assignment_booking_interval_guard" BEFORE INSERT OR UPDATE ON public.booking_assignment FOR EACH ROW EXECUTE FUNCTION public.validate_assignment_interval();

CREATE FUNCTION "public"."guard_assigned_schedule"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.start_datetime, NEW.end_datetime, NEW.vehicle_type_id, NEW.passenger_count)
     IS DISTINCT FROM (OLD.start_datetime, OLD.end_datetime, OLD.vehicle_type_id, OLD.passenger_count)
     AND EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.booking_id = OLD.booking_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
    RAISE EXCEPTION 'Release the active assignment before changing its booking interval' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "booking_assignment_schedule_guard" BEFORE UPDATE ON public.booking FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_schedule();

CREATE FUNCTION "public"."guard_assigned_maintenance"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.maintenance_status IN ('SCHEDULED', 'IN_PROGRESS') THEN
    PERFORM 1 FROM public.vehicle WHERE vehicle_id = NEW.vehicle_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.vehicle_id = NEW.vehicle_id
      AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')
      AND (NEW.maintenance_status = 'IN_PROGRESS' OR NEW.scheduled_date <= (a.reserved_until AT TIME ZONE 'UTC')::date)) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before blocking maintenance' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "maintenance_assignment_guard" BEFORE INSERT OR UPDATE ON public.maintenance_record FOR EACH ROW EXECUTE FUNCTION public.guard_assigned_maintenance();

ALTER TABLE "public"."payment_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."assignment_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_proof" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_assignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."payment_audit", "public"."assignment_request", "public"."payment", "public"."payment_proof", "public"."booking_assignment" FROM anon, authenticated;

COMMIT;
