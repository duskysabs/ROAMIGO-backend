CREATE TYPE public."BookingSalesChannel" AS ENUM ('ONLINE', 'FACE_TO_FACE', 'LEGACY_UNKNOWN');

-- Old rows cannot be classified safely from their payment method or creator role.
ALTER TABLE public.booking ADD COLUMN sales_channel public."BookingSalesChannel" NOT NULL DEFAULT 'LEGACY_UNKNOWN';
ALTER TABLE public.booking_quote
  ADD COLUMN sales_channel public."BookingSalesChannel" NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN operator_user_id uuid REFERENCES public.user_profile(user_id) ON DELETE RESTRICT,
  ADD COLUMN operator_reason varchar(500),
  ADD CONSTRAINT booking_quote_channel_actor CHECK (
    (sales_channel = 'FACE_TO_FACE' AND operator_user_id IS NOT NULL AND operator_reason IS NOT NULL AND length(btrim(operator_reason)) BETWEEN 3 AND 500)
    OR (sales_channel <> 'FACE_TO_FACE' AND operator_user_id IS NULL AND operator_reason IS NULL)
  );

CREATE FUNCTION public.guard_booking_sales_channel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.sales_channel IS DISTINCT FROM OLD.sales_channel THEN
    RAISE EXCEPTION 'Booking sales channel is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_sales_channel_immutable BEFORE UPDATE OF sales_channel ON public.booking
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_sales_channel();

CREATE FUNCTION public.guard_quote_sales_origin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.sales_channel, NEW.operator_user_id, NEW.operator_reason) IS DISTINCT FROM
     (OLD.sales_channel, OLD.operator_user_id, OLD.operator_reason) THEN
    RAISE EXCEPTION 'Quote sales origin is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_quote_sales_origin_immutable BEFORE UPDATE OF sales_channel, operator_user_id, operator_reason ON public.booking_quote
  FOR EACH ROW EXECUTE FUNCTION public.guard_quote_sales_origin();

CREATE FUNCTION public.guard_manual_payment_channel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE channel public."BookingSalesChannel";
BEGIN
  IF NEW.payment_channel <> 'MANUAL' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.booking_id = OLD.booking_id AND NEW.payment_channel = OLD.payment_channel
       AND (NEW.payment_status NOT IN ('PAID', 'CONFIRMED') OR NEW.payment_status = OLD.payment_status) THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT sales_channel INTO channel FROM public.booking WHERE booking_id = NEW.booking_id FOR UPDATE;
  IF channel IS DISTINCT FROM 'FACE_TO_FACE'::public."BookingSalesChannel" THEN
    RAISE EXCEPTION 'Manual payment requires a face-to-face booking' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_manual_channel BEFORE INSERT OR UPDATE OF payment_status, payment_channel, booking_id ON public.payment
  FOR EACH ROW EXECUTE FUNCTION public.guard_manual_payment_channel();
