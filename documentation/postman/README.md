# Booking Review Postman Collection

Import both files into Postman:

1. ROAMIGO-booking-review.postman_collection.json
2. ROAMIGO-local.postman_environment.json

Select the imported environment and fill in the Customer and Staff/Admin
credentials locally. Do not commit populated credentials or access tokens.

Run folders 01 through 05 for the approval path. Customer rejection and Staff
rejection are alternative terminal paths and require a newly generated review
booking.

The collection selects the largest vehicle for the chosen vehicle type and
marks it unavailable. If another vehicle can satisfy the same passenger count,
repeat the unavailable-status request for that vehicle before generating the
quote. The quote test must return resourceAvailability: REVIEW_REQUIRED.

Always run the cleanup request for every vehicle whose status was changed.
Database-backed execution still requires access to the configured Postgres and
Supabase services.
