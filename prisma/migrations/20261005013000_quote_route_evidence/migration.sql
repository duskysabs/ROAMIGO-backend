-- Geoapify route evidence is optional for legacy and Tour Package quotes.
ALTER TABLE "booking_quote" ADD COLUMN "route_evidence" JSONB;
