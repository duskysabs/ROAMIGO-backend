ALTER TABLE public.vehicle_type ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE TABLE public.master_data_audit (
  master_data_audit_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL REFERENCES public.user_profile(user_id) ON DELETE RESTRICT,
  actor_role public."UserRole" NOT NULL CHECK (actor_role = 'ADMIN'),
  record_type varchar(40) NOT NULL CHECK (record_type IN ('TOUR_PACKAGE', 'VEHICLE_TYPE', 'PRICING_CONFIGURATION')),
  record_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  reason varchar(500) NOT NULL CHECK (length(btrim(reason)) >= 3),
  "before" jsonb,
  "after" jsonb NOT NULL,
  occurred_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX master_data_audit_record_type_record_id_occurred_at_idx ON public.master_data_audit(record_type, record_id, occurred_at);
CREATE FUNCTION public.preserve_master_data_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Master data audit is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER master_data_audit_immutable BEFORE UPDATE OR DELETE ON public.master_data_audit
  FOR EACH ROW EXECUTE FUNCTION public.preserve_master_data_audit();
ALTER TABLE public.master_data_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_data_audit FROM anon, authenticated;
