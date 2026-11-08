BEGIN;

ALTER TABLE public.booking_transition ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.booking_transition ADD COLUMN actor_source VARCHAR(10) NOT NULL DEFAULT 'USER';
ALTER TABLE public.booking_transition ADD CONSTRAINT booking_transition_actor_check CHECK (
  (actor_source = 'USER' AND actor_user_id IS NOT NULL) OR (actor_source = 'SYSTEM' AND actor_user_id IS NULL)
);

DROP INDEX public.booking_assignment_booking_id_key;
CREATE INDEX booking_assignment_booking_id_assigned_at_idx ON public.booking_assignment(booking_id, assigned_at);
CREATE UNIQUE INDEX booking_assignment_one_active_per_booking ON public.booking_assignment(booking_id)
WHERE assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED');
ALTER TABLE public.booking_assignment
  ADD COLUMN dispatched_at TIMESTAMPTZ(3),
  ADD COLUMN response_deadline TIMESTAMPTZ(3),
  ADD COLUMN responded_at TIMESTAMPTZ(3),
  ADD COLUMN trip_state VARCHAR(20) NOT NULL DEFAULT 'DISPATCHED';
ALTER TABLE public.booking_assignment ADD CONSTRAINT assignment_trip_state_check CHECK (
  trip_state IN ('DISPATCHED', 'ACKNOWLEDGED', 'DECLINED', 'EXPIRED', 'EN_ROUTE', 'ARRIVED', 'STARTED', 'ENDED')
);
ALTER TABLE public.booking_assignment ADD CONSTRAINT assignment_response_window_check CHECK (
  (dispatched_at IS NULL AND response_deadline IS NULL) OR
  (dispatched_at IS NOT NULL AND response_deadline IS NOT NULL AND response_deadline > dispatched_at)
);
ALTER TABLE public.assignment_request ADD COLUMN is_recovery BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.travel_slip ADD COLUMN completion_snapshot JSONB;

CREATE TABLE public.driver_event (
  driver_event_id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.booking_assignment(booking_assignment_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_user_id UUID REFERENCES public.user_profile(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_source VARCHAR(10) NOT NULL DEFAULT 'USER',
  action VARCHAR(20) NOT NULL,
  reason VARCHAR(500),
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT driver_event_actor_check CHECK (
    (actor_source = 'USER' AND actor_user_id IS NOT NULL) OR (actor_source = 'SYSTEM' AND actor_user_id IS NULL)
  ),
  CONSTRAINT driver_event_action_check CHECK (action IN ('DISPATCHED', 'ACKNOWLEDGED', 'DECLINED', 'EXPIRED', 'EN_ROUTE', 'ARRIVED', 'STARTED', 'ENDED'))
);
CREATE UNIQUE INDEX driver_event_assignment_id_action_key ON public.driver_event(assignment_id, action);

CREATE TABLE public.resource_hold (
  resource_hold_id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.booking_assignment(booking_assignment_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicle(vehicle_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.driver(driver_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  phase VARCHAR(20) NOT NULL CHECK (phase IN ('IN_TRIP', 'TURNAROUND')),
  released_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX resource_hold_assignment_id_key ON public.resource_hold(assignment_id);
CREATE UNIQUE INDEX resource_hold_one_active_vehicle ON public.resource_hold(vehicle_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX resource_hold_one_active_driver ON public.resource_hold(driver_id) WHERE released_at IS NULL;

CREATE FUNCTION public.immutable_driver_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Driver event records are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER driver_event_immutable BEFORE UPDATE OR DELETE ON public.driver_event
FOR EACH ROW EXECUTE FUNCTION public.immutable_driver_event();

CREATE FUNCTION public.immutable_completed_travel_slip() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.travel_slip_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed trip records are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER completed_travel_slip_immutable BEFORE UPDATE OR DELETE ON public.travel_slip
FOR EACH ROW EXECUTE FUNCTION public.immutable_completed_travel_slip();

-- Lifecycle-owned holds permit trip status updates while preventing ordinary availability overrides.
CREATE OR REPLACE FUNCTION public.guard_assigned_resources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hold_phase text;
BEGIN
  IF TG_TABLE_NAME = 'vehicle' THEN
    SELECT phase INTO hold_phase FROM public.resource_hold WHERE vehicle_id = OLD.vehicle_id AND released_at IS NULL;
    IF hold_phase IS NOT NULL THEN
      IF (NEW.assigned_driver_id, NEW.is_deleted, NEW.passenger_capacity, NEW.vehicle_type_id)
         IS NOT DISTINCT FROM (OLD.assigned_driver_id, OLD.is_deleted, OLD.passenger_capacity, OLD.vehicle_type_id)
         AND NEW.vehicle_status::text = hold_phase THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'An active resource hold requires authorized lifecycle release' USING ERRCODE = '23514';
    END IF;
    IF (NEW.vehicle_status, NEW.assigned_driver_id, NEW.is_deleted, NEW.passenger_capacity, NEW.vehicle_type_id)
       IS DISTINCT FROM (OLD.vehicle_status, OLD.assigned_driver_id, OLD.is_deleted, OLD.passenger_capacity, OLD.vehicle_type_id)
       AND EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.vehicle_id = OLD.vehicle_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before vehicle changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'driver' THEN
    SELECT phase INTO hold_phase FROM public.resource_hold WHERE driver_id = OLD.driver_id AND released_at IS NULL;
    IF hold_phase IS NOT NULL THEN
      IF (NEW.license_expiry, NEW.staff_id) IS NOT DISTINCT FROM (OLD.license_expiry, OLD.staff_id)
         AND NEW.driver_status::text = hold_phase THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'An active resource hold requires authorized lifecycle release' USING ERRCODE = '23514';
    END IF;
    IF (NEW.driver_status, NEW.license_expiry, NEW.staff_id) IS DISTINCT FROM (OLD.driver_status, OLD.license_expiry, OLD.staff_id)
       AND EXISTS (SELECT 1 FROM public.booking_assignment a WHERE a.driver_id = OLD.driver_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) THEN
      RAISE EXCEPTION 'An active assignment requires resource recovery before driver changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'staff' THEN
    IF NEW.employment_status IS DISTINCT FROM OLD.employment_status AND (
       EXISTS (SELECT 1 FROM public.driver d JOIN public.booking_assignment a ON a.driver_id = d.driver_id WHERE d.staff_id = OLD.staff_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) OR
       EXISTS (SELECT 1 FROM public.driver d JOIN public.resource_hold h ON h.driver_id = d.driver_id WHERE d.staff_id = OLD.staff_id AND h.released_at IS NULL)) THEN
      RAISE EXCEPTION 'Active work requires recovery before employment changes' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'user_profile' THEN
    IF (NEW.account_status, NEW.role) IS DISTINCT FROM (OLD.account_status, OLD.role) AND (
       EXISTS (SELECT 1 FROM public.staff s JOIN public.driver d ON d.staff_id = s.staff_id JOIN public.booking_assignment a ON a.driver_id = d.driver_id WHERE s.user_id = OLD.user_id AND a.assignment_status IN ('RESERVED', 'ASSIGNED', 'ACKNOWLEDGED')) OR
       EXISTS (SELECT 1 FROM public.staff s JOIN public.driver d ON d.staff_id = s.staff_id JOIN public.resource_hold h ON h.driver_id = d.driver_id WHERE s.user_id = OLD.user_id AND h.released_at IS NULL)) THEN
      RAISE EXCEPTION 'Active work requires recovery before account changes' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Application records are accessed through NestJS, including the public catalog DTOs.
-- Shared Supabase JWT roles cannot enforce application-specific Driver ownership by themselves.
DO $$
DECLARE application_table text;
BEGIN
  FOREACH application_table IN ARRAY ARRAY[
    'user_profile', 'customer', 'staff', 'driver', 'vehicle_type', 'vehicle',
    'tour_package', 'package_stop', 'booking', 'booking_quote', 'booking_transition',
    'booking_stop', 'booking_assignment', 'pricing_configuration', 'fuel_price_record',
    'pricing_calculation', 'payment', 'payment_audit', 'assignment_request',
    'driver_event', 'resource_hold', 'payment_proof', 'accounts_receivable',
    'booking_cancellation', 'refund', 'outsourced_details', 'maintenance_record',
    'travel_slip', 'notification'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', application_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', application_table);
  END LOOP;
END;
$$;

COMMIT;
